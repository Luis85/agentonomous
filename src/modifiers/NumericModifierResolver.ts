import type { ModifierEffect } from './ModifierEffect.js';
import type { ModifierTarget } from './ModifierTarget.js';

/**
 * Predicate used by `NumericModifierResolver` to decide whether a given
 * effect's target participates in a numeric resolution pass.
 */
export type ModifierTargetMatcher = (target: ModifierTarget) => boolean;

/**
 * Composes the numeric effects contributed by a stream of `ModifierEffect`s
 * into a single scalar value.
 *
 * Extracted from `Modifiers` (R-18) so the set/multiply/add/clamp branching
 * can be exercised and evolved independently of the collection/stacking
 * concerns that live on the owning `Modifiers` class.
 *
 * Composition order mirrors the contract documented on `ModifierEffect`:
 *   1. `set` effects win and short-circuit all `multiply`/`add` work.
 *   2. `multiply` effects are multiplied together (multiplicative identity).
 *   3. `add` effects are summed onto the result.
 *   4. `clamp` effects bound the output (lowest `clamp` wins as ceiling).
 *
 * `identity` distinguishes the neutral return value when nothing matches:
 * `1` for multiplicative resolvers (decay, skill effectiveness, locomotion)
 * and `0` for additive resolvers (mood bias, intention bonus).
 */
export class NumericModifierResolver {
  /**
   * Fold the matching effects from `effects` into a scalar.
   *
   * @param effects  Flat stream of effects to consider (callers pass the
   *                 concatenation of every active modifier's `effects`).
   * @param identity Neutral value returned when no effect matches — also
   *                 determines additive vs. multiplicative base.
   * @param match    Predicate narrowing the relevant `ModifierTarget`s.
   */
  resolve(
    effects: Iterable<ModifierEffect>,
    identity: number,
    match: ModifierTargetMatcher,
  ): number {
    let setValue: number | null = null;
    let product = 1;
    let sum = 0;
    let clamp: number | null = null;
    let matched = false;

    for (const effect of effects) {
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

    if (!matched) return identity;
    if (setValue !== null) {
      return clamp !== null ? Math.min(setValue, clamp) : setValue;
    }
    // Treat identity=1 as multiplicative base and identity=0 as additive base.
    const base = identity === 0 ? sum : product * identity + sum;
    return clamp !== null ? Math.min(base, clamp) : base;
  }
}
