import { clamp01, DEFAULT_URGENCY_CURVE, type Need, type NeedsDelta } from './Need.js';

/**
 * Optional decay multiplier lookup — wired to the `Modifiers` collection
 * in M4. Returning `1` means "no multiplier"; `0.5` halves decay, `0` freezes.
 */
export type DecayMultiplierFn = (needId: string) => number;

/**
 * Collection of `Need` values on an agent. Owns decay, urgency, satisfaction,
 * and snapshot/restore for its own slice of state.
 *
 * @experimental — the direct constructor is wrapped by a `needs` module
 * in the 1.1 composable kernel. Prefer `createAgent({ species: { needs:
 * [...] } })` over `new Needs(...)`; reach for the class only if you
 * need full control over the slot.
 */
export class Needs {
  private readonly needs = new Map<string, Need>();

  constructor(defs: readonly Need[] = []) {
    for (const def of defs) {
      this.register(def);
    }
  }

  /** Register or replace a need by id. Level is clamped to [0, 1]. */
  register(def: Need): void {
    this.needs.set(def.id, { ...def, level: clamp01(def.level) });
  }

  has(id: string): boolean {
    return this.needs.has(id);
  }

  get(id: string): Need | undefined {
    return this.needs.get(id);
  }

  list(): readonly Need[] {
    return [...this.needs.values()];
  }

  /**
   * Apply decay for `virtualDtSeconds`. Returns deltas for every need whose
   * level changed or crossed a threshold. Deltas are ordered by registration.
   */
  tick(virtualDtSeconds: number, decayMultiplier?: DecayMultiplierFn): readonly NeedsDelta[] {
    if (virtualDtSeconds <= 0) return [];
    const deltas: NeedsDelta[] = [];
    for (const need of this.needs.values()) {
      const mult = decayMultiplier?.(need.id) ?? 1;
      const before = need.level;
      const after = clamp01(before - need.decayPerSec * mult * virtualDtSeconds);
      if (after === before) continue;
      need.level = after;
      deltas.push(this.buildDelta(need, before, after));
    }
    return deltas;
  }

  /**
   * Increase a need's level by `amount`. Negative amounts decrease. Returns
   * a delta even if the level was clamped to the same value (so callers can
   * still observe a "no-op satisfy" if they care).
   */
  satisfy(id: string, amount: number): NeedsDelta {
    const need = this.needs.get(id);
    if (!need) {
      throw new RangeError(`Needs.satisfy: unknown need id '${id}'`);
    }
    const before = need.level;
    const after = clamp01(before + amount);
    need.level = after;
    return this.buildDelta(need, before, after);
  }

  /** Snapshot → { needId: level }. Cheap, JSON-safe. */
  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const need of this.needs.values()) {
      out[need.id] = need.level;
    }
    return out;
  }

  /** Restore levels from a snapshot. Unknown ids are ignored; missing ids keep their current level. */
  restore(state: Readonly<Record<string, number>>): void {
    for (const [id, level] of Object.entries(state)) {
      const need = this.needs.get(id);
      if (!need) continue;
      need.level = clamp01(level);
    }
  }

  /** Urgency in [0, 1] for a single need. Unknown ids return 0. */
  urgency(id: string): number {
    const need = this.needs.get(id);
    if (!need) return 0;
    const curve = need.urgencyCurve ?? DEFAULT_URGENCY_CURVE;
    return clamp01(curve(need.level));
  }

  /**
   * Return the need with the highest urgency. Threshold filters out calm
   * needs; `0` returns whichever is highest regardless.
   */
  mostUrgent(threshold = 0): Need | undefined {
    let best: Need | undefined;
    let bestScore = threshold;
    for (const need of this.needs.values()) {
      const score = this.urgency(need.id);
      if (score > bestScore) {
        best = need;
        bestScore = score;
      }
    }
    return best;
  }

  private buildDelta(need: Need, before: number, after: number): NeedsDelta {
    const threshold = need.criticalThreshold;
    const crossedCritical = threshold !== undefined && before > threshold && after <= threshold;
    const crossedSafe = threshold !== undefined && before <= threshold && after > threshold;
    return {
      needId: need.id,
      before,
      after,
      crossedCritical,
      crossedSafe,
    };
  }
}
