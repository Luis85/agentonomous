import { defineStore } from 'pinia';
import { markRaw, ref } from 'vue';
import type { Agent, DomainEvent } from 'agentonomous';
import {
  BASE_TIME_SCALE,
  buildAgent,
  type BuildAgentOptions,
} from '../../demo-domain/scenarios/petCare/buildAgent.js';
import { setLearningAgent } from '../../demo-domain/scenarios/petCare/cognition/learning.js';

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

export const useAgentSession = defineStore('agentSession', () => {
  const agent = ref<Agent | null>(null);
  const scenarioId = ref<string>(DEFAULT_SCENARIO_ID);
  const seed = ref<string>('');
  const speedMultiplier = ref<number>(1);
  const running = ref<boolean>(false);
  // Tracked outside the reactive state — Pinia must not traverse the
  // listener closures (and the Set's identity is stable across rebuilds).
  const subscribers = new Set<SubscriberRecord>();

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
   * Slice 1.2a wires only the reset path (`snapshot === null`) — that is
   * all chapter-1 needs. Snapshot deserialisation lands in slice 1.2b
   * alongside `<ExportImportPanel>`; the `unknown` parameter type is
   * intentional until the real `AgentSnapshot` import is needed there.
   */
  function replayFromSnapshot(snapshot: unknown = null): void {
    if (snapshot !== null) {
      throw new Error(
        'useAgentSession.replayFromSnapshot: snapshot deserialisation lands in slice 1.2b',
      );
    }
    const fresh = markRaw(buildAgent({ seed: seed.value }));
    agent.value = fresh;
    setLearningAgent(fresh);
    rebindSubscribers(fresh);
    speedMultiplier.value = 1;
    running.value = true;
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

  return {
    agent,
    scenarioId,
    seed,
    speedMultiplier,
    running,
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
