/**
 * Stable personality dials. Read by the `Reasoner` to bias deliberation and
 * by `personaBias` to weight intention candidates.
 *
 * Conventions that ship with the library (not enforced):
 * - `openness` — receptive to new experiences / interactions.
 * - `aggression` — escalates on conflict.
 * - `ambition` — boosts `do-task` intentions.
 * - `sociability` — boosts `react:greet` intentions.
 * - `curiosity` — biases toward exploration skills.
 * - `hardy` — predisposes to `resilient` passive modifiers.
 *
 * Consumers can add arbitrary numeric traits; unknown keys get 0 bias
 * unless a custom `personaBias` function is injected.
 */
export interface Persona {
  /** Numeric personality dials in [-1, 1] by convention, though not enforced. */
  traits: Record<string, number>;
  /** Free-form archetype labels (e.g., `['timid', 'bookish']`). Cosmetic / UI. */
  tags?: readonly string[];
}
