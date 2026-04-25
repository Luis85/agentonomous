import type { ModifierTarget } from './ModifierTarget.js';

/**
 * A single numerical mutation applied to a target.
 *
 * - `add`       — additive bonus (e.g., `+0.3 intention-score for 'react:greet'`).
 * - `multiply`  — multiplicative scale (e.g., `0.5 × need-decay hunger`).
 * - `clamp`     — ceiling applied after all other effects resolve.
 * - `set`       — absolute override; the most aggressive — use sparingly.
 *
 * Composition order is fixed across the library:
 *   1. `set` effects win and short-circuit.
 *   2. `multiply` effects are multiplied together.
 *   3. `add` effects are summed onto the result.
 *   4. `clamp` effects bound the output (lowest `clamp` wins as ceiling).
 */
export type ModifierEffect = {
  target: ModifierTarget;
  kind: 'add' | 'multiply' | 'clamp' | 'set';
  value: number;
};
