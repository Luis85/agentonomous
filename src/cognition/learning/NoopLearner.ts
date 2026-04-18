import type { Learner } from './Learner.js';

/** Default learner. Discards every outcome. */
export class NoopLearner implements Learner {
  score(): void {}
}
