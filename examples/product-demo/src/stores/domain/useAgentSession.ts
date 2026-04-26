import { defineStore } from 'pinia';
import { computed, markRaw, ref } from 'vue';
import { AGENT_TICKED } from 'agentonomous';
import type {
  Agent,
  AgentSnapshot,
  AgentTickedEvent,
  DecisionTrace,
  DomainEvent,
  SpeciesDescriptor,
} from 'agentonomous';
import {
  BASE_TIME_SCALE,
  buildAgent,
  type BuildAgentOptions,
} from '../../demo-domain/scenarios/petCare/buildAgent.js';
import { setLearningAgent } from '../../demo-domain/scenarios/petCare/cognition/learning.js';
import type { AgentSessionSnapshot, SessionEvent } from '../../demo-domain/walkthrough/types.js';

const DEFAULT_SCENARIO_ID = 'petCare';
const SEED_STORAGE_KEY_PREFIX = 'demo.v2.session.lastSeed.';

function seedStorageKey(scenarioId: string): string {
  return `${SEED_STORAGE_KEY_PREFIX}${scenarioId}`;
}

function readPersistedSeed(scenarioId: string): string | null {
  try {
    const stored = globalThis.localStorage?.getItem(seedStorageKey(scenarioId));
    return typeof stored === 'string' && stored.length > 0 ? stored : null;
  } catch {
    return null;
  }
}

function writePersistedSeed(scenarioId: string, seed: string): void {
  try {
    globalThis.localStorage?.setItem(seedStorageKey(scenarioId), seed);
  } catch {
    // localStorage unavailable (private mode, quota) — silently skip.
  }
}

/** Options accepted by `useAgentSession.init`. */
export type UseAgentSessionInitOptions = {
  readonly seed?: string;
  readonly scenarioId?: string;
  readonly speciesOverride?: BuildAgentOptions['speciesOverride'];
};

/**
 * Pinia domain store wrapping the pet-care scenario's `Agent`. Holds the
 * live agent reference, persists the seed under
 * `demo.v2.session.lastSeed.<scenarioId>` (per design's STO contract),
 * and exposes the control-mode actions consumed by the Pillar-1
 * walkthrough.
 *
 * The tick driver lives outside the store on purpose: keeping
 * `requestAnimationFrame` out of `stores/domain/**` is what NFR-D-1
 * pins down. The driver (rAF in the browser, `ManualClock` in tests)
 * calls `tick(dt)` and the store advances the agent. Storing the
 * `Agent` itself via `markRaw` keeps Pinia's reactivity proxy from
 * traversing the framework's internal mutable state.
 */
/**
 * Per-subscriber bookkeeping. A subscriber survives agent rebuilds
 * (init / replayFromSnapshot) by being re-attached to the new agent;
 * `detach` holds the per-agent unsubscribe handle so the previous
 * binding is released first.
 */
type SubscriberRecord = {
  readonly listener: (event: DomainEvent) => void;
  detach: () => void;
};

/** Bounded ring buffer size for `recentEvents` — feeds tour predicates. */
const RECENT_EVENT_LIMIT = 50;

/**
 * Convert a string seed (`createAgent({ rng: 'whiskers' })`) into a
 * stable numeric form for the `AgentSessionSnapshot.seed` projection.
 * Tour predicates only need identity equality across sibling snapshots,
 * not cryptographic uniqueness — `cyrb53` is plenty.
 */
function hashSeed(seedStr: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < seedStr.length; i += 1) {
    const ch = seedStr.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) * 4294967296 + (h1 >>> 0);
}

export const useAgentSession = defineStore('agentSession', () => {
  const agent = ref<Agent | null>(null);
  const scenarioId = ref<string>(DEFAULT_SCENARIO_ID);
  const seed = ref<string>('');
  const speedMultiplier = ref<number>(1);
  const running = ref<boolean>(false);
  // `tickIndex` mirrors the agent's tick counter for cheap reactivity-
  // friendly reads (the agent itself is `markRaw` so its internal
  // counters don't drive Vue updates). `recentEvents` is a bounded
  // ring buffer feeding tour predicates without re-subscribing per
  // step. Both reset on `init` / `replayFromSnapshot`.
  const tickIndex = ref<number>(0);
  const recentEvents = ref<SessionEvent[]>([]);
  const cognitionModeId = ref<string>('heuristic');
  // Reactive last-tick projection for `<TracePanel>`. Updated inside the
  // internal AGENT_TICKED listener so the panel never needs its own
  // subscription (and therefore no runtime `agentonomous` import).
  const lastTrace = ref<DecisionTrace | null>(null);
  const lastTickNumber = ref<number>(0);
  // Last species override handed to `init`, retained so
  // `replayFromSnapshot(null)` can rebuild the agent with the same
  // configuration the user is currently running. Without this, reset /
  // replay would silently revert to the scenario's default species.
  const lastSpeciesOverride = ref<SpeciesDescriptor | undefined>(undefined);
  // Tracked outside the reactive state — Pinia must not traverse the
  // listener closures (and the Set's identity is stable across rebuilds).
  const subscribers = new Set<SubscriberRecord>();
  // Internal AGENT_TICKED listener: keeps `tickIndex` + `recentEvents`
  // current. Stored separately from user `subscribers` so it survives
  // agent rebuilds via the same rebind path.
  let internalDetach: () => void = () => {};

  function attachInternalListener(target: Agent): void {
    internalDetach();
    internalDetach = target.subscribe((event) => {
      if (event.type === AGENT_TICKED) {
        tickIndex.value += 1;
        const ticked = event as AgentTickedEvent;
        lastTrace.value = ticked.trace;
        lastTickNumber.value = ticked.tickNumber;
      }
      const projected: SessionEvent = { type: event.type, tickIndex: tickIndex.value };
      recentEvents.value.push(projected);
      if (recentEvents.value.length > RECENT_EVENT_LIMIT) {
        recentEvents.value.splice(0, recentEvents.value.length - RECENT_EVENT_LIMIT);
      }
    });
  }

  function rebindSubscribers(target: Agent): void {
    for (const record of subscribers) {
      record.detach();
      record.detach = target.subscribe(record.listener);
    }
  }

  function init(options: UseAgentSessionInitOptions = {}): void {
    const resolvedScenario = options.scenarioId ?? DEFAULT_SCENARIO_ID;
    const resolvedSeed = options.seed ?? readPersistedSeed(resolvedScenario);
    if (resolvedSeed === null) {
      throw new Error(
        `useAgentSession.init: no seed provided and none persisted under ${seedStorageKey(
          resolvedScenario,
        )}. Caller (slice 1.2b's app/main.ts) must generate one.`,
      );
    }

    scenarioId.value = resolvedScenario;
    seed.value = resolvedSeed;
    speedMultiplier.value = 1;
    tickIndex.value = 0;
    recentEvents.value = [];
    lastTrace.value = null;
    lastTickNumber.value = 0;
    lastSpeciesOverride.value = options.speciesOverride;
    const fresh = markRaw(
      buildAgent({
        seed: resolvedSeed,
        ...(options.speciesOverride !== undefined
          ? { speciesOverride: options.speciesOverride }
          : {}),
      }),
    );
    agent.value = fresh;
    // Wire the learning-mode singleton's `agentIdForHydration` + bus
    // subscription. The legacy `src/main.ts` does this immediately after
    // `buildAgent`; without the call, switching to Learning mode reads
    // a null hydration scope and stale feature inputs (mood / recent
    // events).
    setLearningAgent(fresh);
    attachInternalListener(fresh);
    rebindSubscribers(fresh);
    running.value = true;
    writePersistedSeed(resolvedScenario, resolvedSeed);
  }

  async function tick(dtSeconds: number): Promise<void> {
    if (agent.value === null) return;
    await agent.value.tick(dtSeconds);
  }

  function start(): void {
    if (agent.value === null) return;
    running.value = true;
    agent.value.setTimeScale(BASE_TIME_SCALE * speedMultiplier.value);
  }

  function pause(): void {
    if (agent.value === null) return;
    running.value = false;
    agent.value.setTimeScale(0);
  }

  function resume(): void {
    start();
  }

  async function step(dtSeconds = 1): Promise<void> {
    if (agent.value === null) return;
    const wasRunning = running.value;
    if (!wasRunning) agent.value.setTimeScale(BASE_TIME_SCALE * speedMultiplier.value);
    try {
      await agent.value.tick(dtSeconds);
    } finally {
      // `finally` keeps the paused-scale invariant even when `tick`
      // throws (reasoner/runtime errors). Without it the agent stays
      // unpaused while `running` is false — control state inconsistent.
      if (!wasRunning && agent.value !== null) agent.value.setTimeScale(0);
    }
  }

  function setSpeed(multiplier: number): void {
    // Up-front validation: non-finite or non-positive values would either
    // reach `agent.setTimeScale` (which throws after `speedMultiplier`
    // has already been mutated) or — for `0` — silently shadow `pause()`.
    // Reject early so the store's invariants stay consistent.
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new RangeError(
        `useAgentSession.setSpeed: expected a finite positive multiplier, got ${String(multiplier)}`,
      );
    }
    speedMultiplier.value = multiplier;
    if (agent.value !== null && running.value) {
      agent.value.setTimeScale(BASE_TIME_SCALE * multiplier);
    }
  }

  /**
   * Reset (`snapshot === null`) rebuilds the agent from the current seed
   * + species override. Restore (`snapshot !== null`) rebuilds the agent
   * fresh and then hands the parsed snapshot to `agent.restore` with
   * `catchUp: false` — the imported state's virtual-time cursor stays
   * stable, matching the legacy `mountExportImport` semantics.
   *
   * Stale modifiers from the previous agent are dropped by virtue of
   * the rebuild; callers don't need to scrub them up-front.
   */
  async function replayFromSnapshot(snapshot: AgentSnapshot | null = null): Promise<void> {
    const fresh = markRaw(
      buildAgent({
        seed: seed.value,
        ...(lastSpeciesOverride.value !== undefined
          ? { speciesOverride: lastSpeciesOverride.value }
          : {}),
      }),
    );
    agent.value = fresh;
    setLearningAgent(fresh);
    attachInternalListener(fresh);
    rebindSubscribers(fresh);
    speedMultiplier.value = 1;
    running.value = true;
    tickIndex.value = 0;
    recentEvents.value = [];
    lastTrace.value = null;
    lastTickNumber.value = 0;
    if (snapshot !== null) {
      await fresh.restore(snapshot, { catchUp: false });
    }
  }

  /**
   * Subscribe to the live agent's event bus. The returned unsubscribe
   * detaches from whichever agent is current at the time of the call;
   * across `init` / `replayFromSnapshot(null)` rebuilds the listener is
   * automatically re-attached to the fresh agent so reset/replay
   * doesn't silently break AGENT_TICKED-driven view stores.
   *
   * Calling `subscribe` before `init` parks the listener in the
   * registry — it will fire once `init` builds the first agent.
   */
  function subscribe(listener: (event: DomainEvent) => void): () => void {
    const record: SubscriberRecord = {
      listener,
      detach: agent.value !== null ? agent.value.subscribe(listener) : () => {},
    };
    subscribers.add(record);
    return () => {
      record.detach();
      subscribers.delete(record);
    };
  }

  /**
   * Read-only projection consumed by tour completion predicates. The
   * shape mirrors `AgentSessionSnapshot` from the walkthrough domain
   * module so the view layer never has to reach into the live agent
   * directly. Returned as a `computed` so `<TourOverlay>` re-evaluates
   * whenever `tickIndex` / `recentEvents` change.
   */
  const sessionSnapshot = computed<AgentSessionSnapshot>(() => ({
    tickIndex: tickIndex.value,
    cognitionModeId: cognitionModeId.value,
    seed: hashSeed(seed.value),
    recentEvents: recentEvents.value,
  }));

  return {
    agent,
    scenarioId,
    seed,
    speedMultiplier,
    running,
    tickIndex,
    recentEvents,
    cognitionModeId,
    lastTrace,
    lastTickNumber,
    sessionSnapshot,
    lastSpeciesOverride,
    init,
    tick,
    start,
    pause,
    resume,
    step,
    setSpeed,
    replayFromSnapshot,
    subscribe,
  };
});
