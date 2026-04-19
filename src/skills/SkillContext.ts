import type { AgentIdentity } from '../agent/AgentIdentity.js';
import type { DomainEvent } from '../events/DomainEvent.js';
import type { Modifier } from '../modifiers/Modifier.js';
import type { Rng } from '../ports/Rng.js';
import type { WallClock } from '../ports/WallClock.js';

/**
 * Safe mutation surface given to every `Skill.execute`. Exposes the
 * services skills typically need (clock, rng) plus a curated verb list
 * (satisfyNeed, applyModifier, publishEvent) — no direct access to Needs,
 * Modifiers, or the agent class, which keeps invariants intact.
 *
 * More verbs land as later milestones add subsystems: M10 will add
 * `addMemory(record)`.
 */
export interface SkillContext {
  readonly identity: AgentIdentity;
  readonly clock: WallClock;
  readonly rng: Rng;

  /** Raise the named need's level by `amount`. Clamps to [0, 1]. */
  satisfyNeed(needId: string, amount: number): void;

  /** Apply a buff/debuff. Returns the applied Modifier (possibly post-stack). */
  applyModifier(mod: Modifier): Modifier;

  /** Remove a modifier by id. Returns the removed Modifier or `null`. */
  removeModifier(id: string): Modifier | null;

  /** True if a modifier with this id is currently active on the agent. */
  hasModifier(id: string): boolean;

  /** Publish an event onto the bus. */
  publishEvent(event: DomainEvent): void;

  /** Return the current virtual age in seconds (0 if no lifecycle). */
  ageSeconds(): number;
}
