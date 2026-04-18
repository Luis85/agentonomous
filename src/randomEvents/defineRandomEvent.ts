import type { DomainEvent } from '../events/DomainEvent.js';
import type { LifeStage } from '../lifecycle/LifeStage.js';
import type { Modifiers } from '../modifiers/Modifiers.js';
import type { Needs } from '../needs/Needs.js';
import type { Rng } from '../ports/Rng.js';

/**
 * Context handed to random event guards and emitters. The `RandomEventTicker`
 * passes these straight through from its `tick()` call site, so guards can
 * inspect the live `Needs` / `Modifiers` / `LifeStage` snapshot for the agent
 * and use the seeded `Rng` port for any sub-rolls.
 */
export interface RandomEventContext {
  needs: Needs | undefined;
  modifiers: Modifiers;
  stage: LifeStage | undefined;
  rng: Rng;
}

/**
 * Data-driven random event descriptor. Consumers declare an event as a plain
 * object and hand it to `RandomEventTicker.register(...)` (or pass a list to
 * the constructor) — the ticker drives probability scaling, cooldowns, and
 * guard evaluation.
 */
export interface RandomEventDef {
  id: string;
  /** Per-second probability. Scaled by virtualDt inside the ticker. */
  probabilityPerSecond: number;
  /** Seconds between successive fires of this event (game-time). Default: 0. */
  cooldownSeconds?: number;
  /** Optional gate; if it returns false the event can't fire this tick. */
  guard?: (ctx: RandomEventContext) => boolean;
  /** Builder that returns the concrete DomainEvent to publish. */
  emit: (ctx: RandomEventContext) => DomainEvent;
}

/**
 * Trivial passthrough for consistency with `defineModifier` / `defineLifecycle`.
 * Kept as a function (rather than inlining the literal) so content catalogs
 * have a single canonical constructor to import.
 */
export function defineRandomEvent(def: RandomEventDef): RandomEventDef {
  return def;
}
