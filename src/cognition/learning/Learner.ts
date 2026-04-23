import type { AgentAction } from '../../agent/AgentAction.js';
import type { Intention } from '../Intention.js';

/**
 * Scoring / adaptation slot. Consumers who care about reinforcement pass
 * a concrete `Learner` (e.g., a tfjs-backed adapter that forwards
 * outcomes into a `TfjsReasoner.train(...)` queue); the default is
 * `NoopLearner`, which ignores outcomes.
 *
 * Exposed now so the tick pipeline's Stage 8 (score) has a stable seam.
 */
export interface LearningOutcome {
  intention: Intention;
  actions: readonly AgentAction[];
  /** Consumer-defined reward signal. Positive = good, negative = bad. */
  reward?: number;
  /** Free-form metadata (skill outcomes, observed state deltas, ...). */
  details?: Record<string, unknown>;
}

export interface Learner {
  score(outcome: LearningOutcome): void;
}
