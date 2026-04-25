import type { AgentAction } from '../../agent/AgentAction.js';
import type { Intention } from '../Intention.js';

/**
 * Scoring / adaptation slot. Consumers who care about reinforcement pass
 * a concrete `Learner` (e.g., a tfjs-backed adapter that forwards
 * outcomes into a `TfjsReasoner.train(...)` queue); the default is
 * `NoopLearner`, which ignores outcomes.
 *
 * Exposed now so the tick pipeline's Stage 8 (score) has a stable seam.
 *
 * Call cadence (Stage 8 contract): `score()` fires for **every**
 * terminal skill-invocation branch — success AND failure. Success
 * outcomes carry `details.effectiveness` (the post-modifier strength
 * of the completed skill). Failure outcomes carry `details.failed:
 * true` plus `details.code` / `details.message` mirroring the
 * `SkillFailed` event. Consumers that want to train on positive
 * evidence only should switch on `details.failed` in their
 * `toTrainingPair` projection and skip / negate accordingly.
 *
 * Both branches additionally carry `details.preNeeds` — a snapshot of
 * the agent's need levels captured BEFORE the skill mutated state.
 * Use this (not the agent's live `needs`) when projecting features for
 * a training pair: post-skill levels reflect the action's effect, not
 * the state the policy decided from, and training on the post-state
 * inverts the policy direction (e.g. `feed` raises hunger, so a "high
 * hunger → feed" pair would push the network the wrong way). The
 * field is omitted when the agent has no `Needs` subsystem.
 */
export interface LearningOutcome {
  intention: Intention;
  actions: readonly AgentAction[];
  /** Consumer-defined reward signal. Positive = good, negative = bad. */
  reward?: number;
  /**
   * Free-form metadata (skill outcomes, observed state deltas, ...).
   * The cognition pipeline populates `effectiveness` on success and
   * `{ failed, code, message }` on failure, plus `preNeeds` (a
   * `Record<needId, level>` snapshot taken before the skill ran)
   * whenever a `Needs` subsystem is wired — see Stage 8 contract above.
   */
  details?: Record<string, unknown>;
}

export interface Learner {
  score(outcome: LearningOutcome): void;
}
