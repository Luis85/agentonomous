import type { Modifier } from './Modifier.js';
import type { ModifierTarget } from './ModifierTarget.js';

/**
 * Reason a modifier left the collection — used by `Modifiers.tick(...)` to
 * report expirations upstream.
 */
export interface ModifierRemoval {
  modifier: Modifier;
  reason: 'expired' | 'removed' | 'replaced';
}

/**
 * Cross-cutting buff/debuff collection. Consulted every tick by Needs,
 * Mood (M5), Skills (M7), and the Reasoner (M7). Stores modifiers by
 * internal key (id + incrementing ordinal) to support `stack` entries
 * that share an id.
 */
export class Modifiers {
  private readonly entries: { key: string; mod: Modifier }[] = [];
  private ordinal = 0;

  /**
   * Apply a modifier. Returns the new or updated `Modifier` instance, plus
   * a removal record if stacking semantics kicked out an existing one.
   */
  apply(mod: Modifier): { applied: Modifier; removed: ModifierRemoval | null } {
    const existingIndex = this.entries.findIndex((e) => e.mod.id === mod.id);
    if (existingIndex === -1 || mod.stack === 'stack') {
      this.entries.push({ key: `${mod.id}#${this.ordinal++}`, mod });
      return { applied: mod, removed: null };
    }

    const existing = this.entries[existingIndex];
    // Non-null: we only entered this branch when existingIndex !== -1.
    if (!existing) return { applied: mod, removed: null };

    switch (mod.stack) {
      case 'ignore':
        return { applied: existing.mod, removed: null };
      case 'refresh': {
        const refreshed: Modifier = {
          ...existing.mod,
          ...mod,
          appliedAt: mod.appliedAt,
        };
        existing.mod = refreshed;
        return { applied: refreshed, removed: null };
      }
      case 'replace': {
        const removed: ModifierRemoval = { modifier: existing.mod, reason: 'replaced' };
        this.entries.splice(existingIndex, 1);
        this.entries.push({ key: `${mod.id}#${this.ordinal++}`, mod });
        return { applied: mod, removed };
      }
      default:
        // Unknown stack policy — fall back to append (stack).
        this.entries.push({ key: `${mod.id}#${this.ordinal++}`, mod });
        return { applied: mod, removed: null };
    }
  }

  /** Remove the first modifier with the given id. Returns it if found. */
  remove(id: string): Modifier | null {
    const index = this.entries.findIndex((e) => e.mod.id === id);
    if (index === -1) return null;
    const entry = this.entries[index];
    this.entries.splice(index, 1);
    return entry?.mod ?? null;
  }

  /** Remove every modifier with the given id. Returns the removed instances. */
  removeAll(id: string): readonly Modifier[] {
    const removed: Modifier[] = [];
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (entry && entry.mod.id === id) {
        removed.unshift(entry.mod);
        this.entries.splice(i, 1);
      }
    }
    return removed;
  }

  has(id: string): boolean {
    return this.entries.some((e) => e.mod.id === id);
  }

  list(): readonly Modifier[] {
    return this.entries.map((e) => e.mod);
  }

  /**
   * Expire modifiers whose `expiresAt` is at or before `wallNowMs`.
   * Returns `ModifierRemoval`s for each expired entry in expiration order.
   */
  tick(wallNowMs: number): readonly ModifierRemoval[] {
    const expired: ModifierRemoval[] = [];
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (!entry) continue;
      const exp = entry.mod.expiresAt;
      if (exp !== undefined && exp <= wallNowMs) {
        expired.unshift({ modifier: entry.mod, reason: 'expired' });
        this.entries.splice(i, 1);
      }
    }
    return expired;
  }

  // =========================================================================
  // Query helpers — consumed by Needs, Mood, Skills, Reasoner.
  // =========================================================================

  /**
   * Multiplier to apply to a need's decay rate. Product of all `multiply`
   * effects targeting `{ type: 'need-decay', needId }`; returns 1 if none.
   * `set` effects short-circuit; `add` effects are additive on top of the
   * product; `clamp` effects cap the result.
   */
  decayMultiplier(needId: string): number {
    return this.resolveNumeric(
      (t) => t.type === 'need-decay' && (t as { needId: string }).needId === needId,
      1,
    );
  }

  /**
   * Additive bias on a specific mood category (e.g., `'playful'`). Defaults
   * to 0.
   */
  moodBias(category: string): number {
    return this.resolveNumeric(
      (t) => t.type === 'mood-bias' && (t as { category: string }).category === category,
      0,
    );
  }

  /** Effectiveness multiplier for a skill. Defaults to 1. */
  skillEffectiveness(skillId: string): number {
    return this.resolveNumeric(
      (t) => t.type === 'skill-effectiveness' && (t as { skillId: string }).skillId === skillId,
      1,
    );
  }

  /** Additive bonus on an intention type's candidate score. Defaults to 0. */
  intentionBonus(intentionType: string): number {
    return this.resolveNumeric(
      (t) =>
        t.type === 'intention-score' &&
        (t as { intentionType: string }).intentionType === intentionType,
      0,
    );
  }

  /** Multiplicative scale on locomotion speed. Defaults to 1. */
  locomotionSpeedMultiplier(): number {
    return this.resolveNumeric((t) => t.type === 'locomotion-speed', 1);
  }

  /**
   * Flat multiplier/bonus resolver. `identity` is the neutral value returned
   * when no effect matches (0 for additive, 1 for multiplicative).
   */
  private resolveNumeric(match: (target: ModifierTarget) => boolean, identity: number): number {
    let setValue: number | null = null;
    let product = 1;
    let sum = 0;
    let clamp: number | null = null;
    let matched = false;

    for (const entry of this.entries) {
      for (const effect of entry.mod.effects) {
        if (!match(effect.target)) continue;
        matched = true;
        switch (effect.kind) {
          case 'set':
            setValue = effect.value;
            break;
          case 'multiply':
            product *= effect.value;
            break;
          case 'add':
            sum += effect.value;
            break;
          case 'clamp':
            clamp = clamp === null ? effect.value : Math.min(clamp, effect.value);
            break;
        }
      }
    }

    if (!matched) return identity;
    if (setValue !== null) {
      return clamp !== null ? Math.min(setValue, clamp) : setValue;
    }
    // Treat identity=1 as multiplicative base and identity=0 as additive base.
    const base = identity === 0 ? sum : product * identity + sum;
    return clamp !== null ? Math.min(base, clamp) : base;
  }
}
