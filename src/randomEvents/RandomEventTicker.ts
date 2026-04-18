import type { DomainEvent } from '../events/DomainEvent.js';
import type { LifeStage } from '../lifecycle/LifeStage.js';
import type { Modifiers } from '../modifiers/Modifiers.js';
import type { Needs } from '../needs/Needs.js';
import type { Rng } from '../ports/Rng.js';
import type { RandomEventContext, RandomEventDef } from './defineRandomEvent.js';

/**
 * Inputs to a single ticker step. Callers (the agent orchestrator) pass a
 * `virtualDtSeconds` for probability scaling and a `virtualNowSeconds`
 * cumulative timestamp so the ticker can track per-def cooldowns without
 * owning its own clock.
 */
export interface RandomEventTickOptions {
  virtualDtSeconds: number;
  /** Cumulative virtual time for cooldown tracking. */
  virtualNowSeconds: number;
  rng: Rng;
  needs: Needs | undefined;
  modifiers: Modifiers;
  stage: LifeStage | undefined;
}

/**
 * Seeded per-tick random event dispatcher. Holds a registration-ordered list
 * of `RandomEventDef`s, rolls each one's probability scaled to the tick's
 * `virtualDtSeconds`, and honours per-def cooldowns plus optional guards.
 *
 * The ticker is intentionally passive: it returns the `DomainEvent`s it
 * rolled this tick and leaves publishing to the orchestrator, matching the
 * library's "no globals, no side effects" contract.
 */
export class RandomEventTicker {
  private readonly defs: RandomEventDef[] = [];
  private readonly lastFiredAt = new Map<string, number>();

  constructor(defs: readonly RandomEventDef[] = []) {
    for (const def of defs) {
      this.register(def);
    }
  }

  register(def: RandomEventDef): void {
    this.defs.push(def);
  }

  /**
   * Roll each registered event once.
   *
   * For every def:
   *   1. Skip if cooldown hasn't elapsed (`lastFiredAt + cooldownSeconds > virtualNowSeconds`).
   *   2. Skip if `guard(ctx)` is false.
   *   3. Compute `effectiveP = 1 - (1 - p) ** dt` (Poisson-ish scaling, correct under long dt).
   *   4. On `rng.chance(effectiveP)`, emit the event and stamp `lastFiredAt`.
   *
   * Returns events in registration order.
   */
  tick(opts: RandomEventTickOptions): DomainEvent[] {
    const { virtualDtSeconds, virtualNowSeconds, rng, needs, modifiers, stage } = opts;
    if (virtualDtSeconds <= 0) return [];

    const ctx: RandomEventContext = { needs, modifiers, stage, rng };
    const emitted: DomainEvent[] = [];

    for (const def of this.defs) {
      const cooldown = def.cooldownSeconds ?? 0;
      const last = this.lastFiredAt.get(def.id);
      if (last !== undefined && last + cooldown > virtualNowSeconds) continue;

      if (def.guard && !def.guard(ctx)) continue;

      const p = def.probabilityPerSecond;
      const effectiveP = p <= 0 ? 0 : p >= 1 ? 1 : 1 - (1 - p) ** virtualDtSeconds;

      if (!rng.chance(effectiveP)) continue;

      emitted.push(def.emit(ctx));
      this.lastFiredAt.set(def.id, virtualNowSeconds);
    }

    return emitted;
  }

  /** List registered defs (debugging). */
  list(): readonly RandomEventDef[] {
    return this.defs;
  }
}
