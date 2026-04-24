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
  // the fresh agent's constructor value. Pre-v2 snapshots omit this
  // field and keep the constructor value. Routed through
  // `setTimeScale` so a corrupted snapshot (negative / NaN / Infinity)
  // throws `InvalidTimeScaleError` instead of silently poisoning the
  // tick loop.
  if (snapshot.timeScale !== undefined) {
    agent.setTimeScale(snapshot.timeScale);
  }

  if (snapshot.lifecycle) {
    agent.applyLifecycleSnapshot(snapshot.lifecycle);
  }

  if (snapshot.needs && agent.needs) {
    agent.needs.restore(snapshot.needs);
  }

  if (snapshot.modifiers) {
    // Restore replaces (not merges) modifier state — see restore()'s
    // contract on Agent. Clear any pre-existing modifiers on the
    // target before re-applying the snapshot's. Gated on presence of
    // the `modifiers` slice so partial snapshots (`include: [...]`)
    // still leave unrelated slices untouched on the target.
    for (const existingId of new Set(agent.modifiers.list().map((m) => m.id))) {
      agent.modifiers.removeAll(existingId);
    }
    const nowMs = agent.clock.now();
    for (const mod of snapshot.modifiers) {
      // Boundary case: modifiers whose expiresAt has already passed at
      // the clock's current time are dropped on restore AND a
      // `ModifierExpired` event fires exactly once so downstream
      // consumers (stores, UIs, logs) see the expiration in the same
      // shape they would from a normal tick.
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

  if (snapshot.mood) {
    agent.currentMood = { ...snapshot.mood };
  }

  if (snapshot.animation) {
    agent.animation.restore({ state: snapshot.animation.state });
    agent.currentActiveSkillId = snapshot.animation.activeSkillId;
  }

  if (snapshot.memory && agent.memory && isInMemoryMemoryAdapter(agent.memory)) {
    agent.memory.restore(snapshot.memory);
  }

  if (opts.catchUp !== undefined && opts.catchUp !== false) {
    const nowMs = agent.clock.now();
    const elapsedMs = Math.max(0, nowMs - snapshot.snapshotAt);
    // Total virtual budget is computed once at restore entry. The
    // per-chunk divisor below re-reads `getTimeScale()` so a reactive
    // handler that calls `setTimeScale()` mid-catch-up still applies
    // on the next chunk, matching the documented `setTimeScale`
    // semantics ("takes effect on the NEXT tick").
    const elapsedSec = (elapsedMs / 1000) * agent.getTimeScale();
    const chunkOpts =
      typeof opts.catchUp === 'object' && opts.catchUp.chunkVirtualSeconds !== undefined
        ? { chunkVirtualSeconds: opts.catchUp.chunkVirtualSeconds }
        : {};
    await runCatchUp(
      elapsedSec,
      async (chunk) => {
        // Feed virtual dt back through tick(). dt is in real seconds
        // before timeScale; invert it here using the *current* scale
        // so a setTimeScale() between chunks propagates.
        const realDt = chunk / agent.getTimeScale();
        await agent.tick(realDt);
      },
      chunkOpts,
    );
  }

  agent.reasoner.reset?.();
}
