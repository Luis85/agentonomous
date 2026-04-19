import type { AgentIdentity } from '../agent/AgentIdentity.js';
import type { AnimationState } from '../animation/AnimationState.js';
import type { DomainEvent } from '../events/DomainEvent.js';
import type { LifeStage } from '../lifecycle/LifeStage.js';
import type { MemoryRecord } from '../memory/MemoryRecord.js';
import type { Modifier } from '../modifiers/Modifier.js';
import type { Mood } from '../mood/Mood.js';

/**
 * Subsystem keys that can be included/excluded in `agent.snapshot({ include })`.
 */
export type SnapshotPart =
  | 'identity'
  | 'lifecycle'
  | 'needs'
  | 'modifiers'
  | 'mood'
  | 'animation'
  | 'memory'
  | 'beliefs'
  | 'custom';

/**
 * Monolithic, versioned snapshot of an agent's mutable state.
 *
 * Every field except `schemaVersion`, `snapshotAt`, and `identity` is
 * optional so consumers can partial-snapshot via `include` filtering.
 *
 * Opaque subsystem payloads (beliefs, custom) are `unknown` — schema is
 * owned by the plugin that populates them.
 */
export interface AgentSnapshot {
  schemaVersion: number;
  /** Wall-clock ms at save time. */
  snapshotAt: number;

  identity: AgentIdentity;

  lifecycle?: {
    bornAt: number;
    ageSeconds: number;
    stage: LifeStage;
  };

  needs?: Record<string, number>;

  modifiers?: readonly Modifier[];

  mood?: Mood;

  /**
   * Animation state machine slice + the id of the skill (if any) currently
   * driving the animation. Persisted so a fresh agent rehydrated from a
   * snapshot mid-skill doesn't emit a spurious `AnimationTransition` on
   * the first post-restore tick.
   */
  animation?: {
    state: AnimationState;
    activeSkillId: string | undefined;
  };

  memory?: readonly MemoryRecord[];

  /** Reasoner-owned blackboard. Opaque to the core. */
  beliefs?: unknown;

  /** Consumer-owned extension slot. */
  custom?: Record<string, unknown>;

  /**
   * Pending events queued on the bus at save time. Restored onto the fresh
   * bus so in-flight interactions aren't lost across reload.
   */
  pendingEvents?: readonly DomainEvent[];
}

export const CURRENT_SNAPSHOT_VERSION = 1 as const;
