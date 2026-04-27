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
import {
  COGNITION_MODES,
  type CognitionModeSpec,
} from '../../demo-domain/scenarios/petCare/cognition/index.js';
import { setLearningAgent } from '../../demo-domain/scenarios/petCare/cognition/learning.js';
import type { AgentSessionSnapshot, SessionEvent } from '../../demo-domain/walkthrough/types.js';

export const DEFAULT_SCENARIO_ID = 'petCare';
const SEED_STORAGE_KEY_PREFIX = 'demo.v2.session.lastSeed.';

function seedStorageKey(scenarioId: string): string {
  return `${SEED_STORAGE_KEY_PREFIX}${scenarioId}`;
}

export function readPersistedSeed(scenarioId: string): string | null {
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
  // Monotonic write counter for `recentEvents`. The buffer is capped at
  // `RECENT_EVENT_LIMIT` and trimmed on every push past the cap, so
  // `recentEvents.length` saturates and stops changing — watchers keyed
  // on the length silently miss UI events once the buffer is full.
  // Subscribers (`<TourOverlay>`'s predicate re-evaluator) watch this
  // counter instead so every push is visible regardless of trim.
  const recentEventsVersion = ref<number>(0);
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
  // Monotonic token for stale-completion detection in async cognition
  // swaps. Bumped on every agent rebuild + at the start of each
  // `setCognitionMode` so an in-flight probe/construct that resolves
  // after a rebuild or a competing swap drops its result instead of
  // overwriting newer state.
  let cognitionToken = 0;

  function attachInternalListener(target: Agent): void {
    internalDetach();
    internalDetach = target.subscribe((event) => {
      if (event.type === AGENT_TICKED) {
        const ticked = event as AgentTickedEvent;
        // Gate `tickIndex` on real virtual-time advancement: `Agent.tick`
        // still publishes AGENT_TICKED at `timeScale === 0` so the trace
        // panel and event ring buffer keep observing the paused frame,
        // but a frozen frame must NOT count toward tour-progression
        // predicates like chapter-1's `tickAtLeast(N)` — otherwise
        // pause-then-wait silently auto-completes the tour.
        if (ticked.virtualDtSeconds > 0) tickIndex.value += 1;
        lastTrace.value = ticked.trace;
        lastTickNumber.value = ticked.tickNumber;
      }
      const projected: SessionEvent = { type: event.type, tickIndex: tickIndex.value };
      recentEvents.value.push(projected);
      if (recentEvents.value.length > RECENT_EVENT_LIMIT) {
        recentEvents.value.splice(0, recentEvents.value.length - RECENT_EVENT_LIMIT);
      }
      recentEventsVersion.value += 1;
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
    // `buildAgent` returns a fresh agent on the default heuristic
    // reasoner. Without resetting `cognitionModeId` here, a previously-
    // selected mode (e.g. `'bt'`) would persist on the new agent's HUD
    // readout and silently auto-fire chapter-3's
    // `not(cognitionModeIs('heuristic'))` predicate after a reset/
    // import, advancing the tour without a real swap.
    cognitionModeId.value = 'heuristic';
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
    cognitionToken += 1;
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

  /**
   * Push a synthetic UI event onto the recent-events ring buffer. Used
   * by tour-aware components (`<TracePanel>`, `<ExportImportPanel>`,
   * the JSON-preview placeholder in `<HudPanel>`) to record a moment
   * the user can act on — chapter predicates use `eventEmittedSinceStep`
   * to detect the moment without coupling to UI internals.
   *
   * UI events share the same `SessionEvent` projection as agent-emitted
   * events, so chapter predicates don't need to know the difference. The
   * `recentEvents` ring buffer stays bounded at `RECENT_EVENT_LIMIT`.
   */
  function recordUiEvent(type: string): void {
    recentEvents.value.push({ type, tickIndex: tickIndex.value });
    if (recentEvents.value.length > RECENT_EVENT_LIMIT) {
      recentEvents.value.splice(0, recentEvents.value.length - RECENT_EVENT_LIMIT);
    }
    recentEventsVersion.value += 1;
  }

  /**
   * Swap the live agent's reasoner to the requested cognition mode.
   * Probes the mode's peer dep before constructing a reasoner; throws
   * with a peer-install hint when probe fails. Callers (the cognition
   * toggle in `<HudPanel>`) should surface the error to the user.
   *
   * Slice 1.3 wires this so chapter 3's predicate can observe a real
   * swap; the full per-mode UI (loss sparkline, prediction strip,
   * train button) is Pillar-2's slice 2.5.
   *
   * Stale-completion guard: `probe()` and `construct()` are async
   * (peer-dep modes do dynamic imports), so a parallel `init()` /
   * `replayFromSnapshot()` / second `setCognitionMode()` can land
   * before this call's awaits resolve. The token bumped here +
   * stamped on every agent rebuild means a stale completion drops
   * its result on the floor instead of overwriting the newer state
   * (and silently emitting a misleading `CognitionModeChanged`).
   */
  async function setCognitionMode(modeId: CognitionModeSpec['id']): Promise<void> {
    const mode = COGNITION_MODES.find((m) => m.id === modeId);
    if (mode === undefined) {
      throw new Error(`useAgentSession.setCognitionMode: unknown mode "${String(modeId)}".`);
    }
    const targetAgent = agent.value;
    if (targetAgent === null) {
      throw new Error('useAgentSession.setCognitionMode: no live agent (call init() first).');
    }
    cognitionToken += 1;
    const myToken = cognitionToken;
    const available = await mode.probe();
    if (myToken !== cognitionToken || agent.value !== targetAgent) return;
    if (!available) {
      const hint =
        mode.peerName === null
          ? `mode "${modeId}" unavailable.`
          : `mode "${modeId}" unavailable — install ${mode.peerName} to enable.`;
      throw new Error(`useAgentSession.setCognitionMode: ${hint}`);
    }
    const reasoner = await mode.construct();
    if (myToken !== cognitionToken || agent.value !== targetAgent) return;
    targetAgent.setReasoner(reasoner);
    cognitionModeId.value = modeId;
    recordUiEvent('CognitionModeChanged');
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
   * + species override and clears any per-agent learning artifacts so
   * the next Learning-mode hydration cannot re-load weights trained on
   * the previous pet. Restore (`snapshot !== null`) rebuilds the agent
   * fresh and hands the parsed snapshot to `agent.restore` with
   * `catchUp: false` — the imported state's virtual-time cursor stays
   * stable, matching the legacy `mountExportImport` semantics.
   *
   * Restore is attempted on the FRESH agent BEFORE we publish it as the
   * live one: a syntactically-valid-but-semantically-broken snapshot
   * makes `restore` reject, and we want that rejection to leave the
   * current pet untouched (a failed import must not be destructive).
   * On rejection the fresh agent is dropped and the error propagates
   * to the caller (typically `<ExportImportPanel>`'s alert path).
   *
   * Speed + control state (`speedMultiplier`, `running`) are preserved
   * across replay — they reflect the user's UI choice, not the
   * snapshot's contents, so Reset / New-pet / import must not silently
   * unpause or rescale the simulation.
   *
   * Stale modifiers from the previous agent are dropped by virtue of
   * the rebuild; callers don't need to scrub them up-front.
   */
  async function replayFromSnapshot(snapshot: AgentSnapshot | null = null): Promise<void> {
    // Capture the user's currently-selected cognition mode BEFORE the
    // rebuild. The reset path (`snapshot === null`) discards it; the
    // import path (`snapshot !== null`) re-applies it to the fresh
    // agent so chapter-5's deterministic-replay flow uses the same
    // decision policy as the exported run.
    const previousMode = cognitionModeId.value;
    const fresh = markRaw(
      buildAgent({
        seed: seed.value,
        ...(lastSpeciesOverride.value !== undefined
          ? { speciesOverride: lastSpeciesOverride.value }
          : {}),
      }),
    );
    if (snapshot !== null) {
      // Throws here propagate to caller WITHOUT swapping the live agent.
      await fresh.restore(snapshot, { catchUp: false });
    } else {
      // Reset path: discard the previous agent's persisted learning
      // network so a freshly trained model isn't silently rehydrated
      // onto the new pet. Same key the cognition switcher's "Untrain"
      // and Train code paths use.
      const prev = agent.value;
      if (prev !== null) {
        try {
          globalThis.localStorage?.removeItem(`agentonomous/${prev.identity.id}/tfjs-network`);
        } catch {
          // localStorage unavailable — fresh learning-mode construct
          // falls back to the bundled baseline anyway.
        }
      }
    }
    agent.value = fresh;
    setLearningAgent(fresh);
    attachInternalListener(fresh);
    rebindSubscribers(fresh);
    // Replay the user's current control state onto the fresh agent.
    // `buildAgent` returns a running agent at BASE_TIME_SCALE; if the
    // user had paused or scaled before reset/import, mirror that here.
    fresh.setTimeScale(running.value ? BASE_TIME_SCALE * speedMultiplier.value : 0);
    tickIndex.value = 0;
    recentEvents.value = [];
    lastTrace.value = null;
    lastTickNumber.value = 0;
    // The fresh agent boots on the default heuristic reasoner; sync
    // the readout to match. The import path below re-applies the
    // user's previous mode (so deterministic replay matches the
    // exported run's policy); the reset path leaves it at heuristic.
    cognitionModeId.value = 'heuristic';
    // Drop any in-flight `setCognitionMode` request — its `setReasoner`
    // call would land on the new agent under the old user's intent.
    cognitionToken += 1;

    if (snapshot !== null && previousMode !== 'heuristic') {
      // Re-apply the user's active cognition mode to the fresh agent
      // so chapter-5 replay reproduces the exported run's behaviour.
      // If the peer dep is no longer available (uninstalled between
      // export and import), `setCognitionMode` throws — swallow here
      // so the import itself succeeds; cognitionModeId already
      // reflects 'heuristic' (the agent's actual reasoner) and the
      // user can retry the swap manually via the HUD picker.
      try {
        await setCognitionMode(previousMode as CognitionModeSpec['id']);
      } catch {
        // intentional swallow — see comment above.
      }
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
    recentEventsVersion,
    cognitionModeId,
    lastTrace,
    lastTickNumber,
    sessionSnapshot,
    lastSpeciesOverride,
    // Re-export the scenario's cognition mode registry so the HUD's
    // picker can render labels + per-mode probes without taking a
    // runtime import on `demo-domain/scenarios/...` (lint:demo's
    // no-restricted-imports rule keeps presentation/view layers off
    // the domain module).
    cognitionModes: COGNITION_MODES,
    init,
    tick,
    start,
    pause,
    resume,
    step,
    setSpeed,
    setCognitionMode,
    recordUiEvent,
    replayFromSnapshot,
    subscribe,
  };
});

export type { CognitionModeSpec };
