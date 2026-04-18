/**
 * Source of pseudo-randomness. Library code reads RNG through this port so
 * tests can pin the sequence by seeding a `SeededRng`.
 */
export interface Rng {
  /** Uniform random float in [0, 1). */
  next(): number;

  /** Uniform random integer in [min, max] (inclusive on both ends). */
  int(min: number, max: number): number;

  /**
   * Probability check: returns `true` with probability `p` ∈ [0, 1].
   * Sugar that keeps consumers from fumbling `< vs ≤` boundaries.
   */
  chance(p: number): boolean;

  /** Uniform random element from a non-empty array. */
  pick<T>(items: readonly T[]): T;
}
