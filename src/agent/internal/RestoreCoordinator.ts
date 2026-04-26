import { MODIFIER_EXPIRED } from '../../events/standardEvents.js';
import { isInMemoryMemoryAdapter } from '../../memory/InMemoryMemoryAdapter.js';
import { runCatchUp } from '../../persistence/offlineCatchUp.js';
import type { AgentSnapshot } from '../../persistence/AgentSnapshot.js';
import type { Agent } from '../Agent.js';

/**
 * Options forwarded from `Agent.restore` to `runRestore`.
 *
 * @internal
 */
export type RestoreOptions = {
  catchUp?: boolean | { chunkVirtualSeconds?: number };
};

/**
 * Apply a snapshot to an already-constructed agent. Mirrors the
 * subsystem ordering documented on `Agent.restore`: timeScale →
 * lifecycle → needs → modifiers → mood → animation → memory → catch-up
 * → reasoner reset.
 *
 * Each slice is gated on snapshot presence so partial snapshots
 * (`include`-filtered captures) leave unrelated slices untouched on the
 * target. Modifier replacement (not merge) and over-due `expiresAt`
 * eviction-with-event happen here.
 *
 * @internal
 */
export async function runRestore(
  agent: Agent,
  snapshot: AgentSnapshot,
  opts: RestoreOptions = {},
): Promise<void> {
  // Apply the snapshotted timeScale first so catch-up (below) and any
  // subsequent ticks run at the cadence the snapshot was taken at, not
  // the fresh agent's constructor value. Routed through `setTimeScale`
  // so a corrupted snapshot (negative / NaN / Infinity) throws
  // `InvalidTimeScaleError` instead of silently poisoning the tick loop.
  if (snapshot.timeScale !== undefined) {
    agent.setTimeScale(snapshot.timeScale);
  }

  if (snapshot.lifecycle) agent.applyLifecycleSnapshot(snapshot.lifecycle);
  if (snapshot.needs && agent.needs) agent.needs.restore(snapshot.needs);
  if (snapshot.modifiers) restoreModifiers(agent, snapshot.modifiers);
  if (snapshot.mood) agent.currentMood = { ...snapshot.mood };
  if (snapshot.animation) restoreAnimation(agent, snapshot.animation);
  restoreMemory(agent, snapshot);
  await runCatchUpIfRequested(agent, snapshot, opts);

  agent.reasoner.reset?.();
}

/**
 * Replaces (not merges) modifier state. Pre-existing modifiers on the
 * target are cleared before re-applying the snapshot's. Modifiers whose
 * `expiresAt` has already passed at the clock's current time are dropped
 * AND a `ModifierExpired` event fires exactly once so downstream
 * consumers (stores, UIs, logs) see the expiration in the same shape
 * they would from a normal tick.
 */
function restoreModifiers(agent: Agent, modifiers: AgentSnapshot['modifiers']): void {
  if (!modifiers) return;
  for (const existingId of new Set(agent.modifiers.list().map((m) => m.id))) {
    agent.modifiers.removeAll(existingId);
  }
  const nowMs = agent.clock.now();
  for (const mod of modifiers) {
    if (mod.expiresAt !== undefined && mod.expiresAt <= nowMs) {
      agent.publishEvent({
        type: MODIFIER_EXPIRED,
        at: nowMs,
        agentId: agent.identity.id,
        modifierId: mod.id,
        source: mod.source,
        ...(mod.visual?.fxHint !== undefined ? { fxHint: mod.visual.fxHint } : {}),
      });
      continue;
    }
    agent.modifiers.apply(mod);
  }
}

function restoreAnimation(agent: Agent, animation: NonNullable<AgentSnapshot['animation']>): void {
  agent.animation.restore({ state: animation.state });
  agent.currentActiveSkillId = animation.activeSkillId;
}

function restoreMemory(agent: Agent, snapshot: AgentSnapshot): void {
  if (!snapshot.memory) return;
  if (!agent.memory) return;
  if (!isInMemoryMemoryAdapter(agent.memory)) return;
  agent.memory.restore(snapshot.memory);
}

/**
 * Replays the wall-clock gap between snapshotAt and now, in chunks, by
 * feeding virtual dt back through `tick()`. Mid-catch-up `setTimeScale`
 * propagates because `tick()` re-reads timeScale per tick — see
 * `setTimeScale`'s documented "takes effect on the NEXT tick" semantics.
 */
async function runCatchUpIfRequested(
  agent: Agent,
  snapshot: AgentSnapshot,
  opts: RestoreOptions,
): Promise<void> {
  if (opts.catchUp === undefined || opts.catchUp === false) return;
  const nowMs = agent.clock.now();
  const elapsedMs = Math.max(0, nowMs - snapshot.snapshotAt);
  const elapsedSec = (elapsedMs / 1000) * agent.getTimeScale();
  const chunkOpts =
    typeof opts.catchUp === 'object' && opts.catchUp.chunkVirtualSeconds !== undefined
      ? { chunkVirtualSeconds: opts.catchUp.chunkVirtualSeconds }
      : {};
  await runCatchUp(
    elapsedSec,
    async (chunk) => {
      const realDt = chunk / agent.getTimeScale();
      await agent.tick(realDt);
    },
    chunkOpts,
  );
}
