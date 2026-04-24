import { isInMemoryMemoryAdapter } from '../../memory/InMemoryMemoryAdapter.js';
import {
  CURRENT_SNAPSHOT_VERSION,
  type AgentSnapshot,
  type SnapshotPart,
} from '../../persistence/AgentSnapshot.js';
import type { Agent } from '../Agent.js';

/**
 * Build an `AgentSnapshot` from the agent's current state. `include`
 * trims heavy subsystems out of the saved payload (e.g. omit
 * `'memory'` for a smaller capture).
 *
 * Slices are gated on subsystem presence so an agent without a
 * lifecycle/needs/etc. simply produces a snapshot with that field
 * absent — symmetric with `runRestore`.
 *
 * @internal
 */
export function assembleSnapshot(
  agent: Agent,
  opts: { include?: readonly SnapshotPart[] } = {},
): AgentSnapshot {
  const wanted = (part: SnapshotPart): boolean =>
    opts.include === undefined || opts.include.includes(part);

  const snap: AgentSnapshot = {
    schemaVersion: CURRENT_SNAPSHOT_VERSION,
    snapshotAt: agent.clock.now(),
    identity: agent.identity,
    timeScale: agent.getTimeScale(),
  };
  if (agent.ageModel && wanted('lifecycle')) {
    snap.lifecycle = agent.ageModel.snapshot();
  }
  if (agent.needs && wanted('needs')) {
    snap.needs = agent.needs.snapshot();
  }
  if (wanted('modifiers')) {
    const list = agent.modifiers.list();
    if (list.length > 0) snap.modifiers = [...list];
  }
  if (agent.currentMood && wanted('mood')) {
    snap.mood = { ...agent.currentMood };
  }
  if (wanted('animation')) {
    snap.animation = {
      state: agent.animation.current(),
      activeSkillId: agent.currentActiveSkillId,
    };
  }
  if (agent.memory && wanted('memory') && isInMemoryMemoryAdapter(agent.memory)) {
    const records = agent.memory.snapshot();
    if (records.length > 0) snap.memory = [...records];
  }
  return snap;
}
