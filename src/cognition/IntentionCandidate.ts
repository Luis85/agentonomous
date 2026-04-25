import type { Intention } from './Intention.js';

/**
 * Scored candidate produced by a source (needs policy, reactive handler,
 * task queue, ...). The `Reasoner` combines candidates from all sources,
 * applies `personaBias`, and picks the top one.
 */
export interface IntentionCandidate {
  intention: Intention;
  /**
   * Urgency / priority in `[0, 1]` — urgency-aligned, larger means more
   * urgent. Acts as the primary discriminant when the reasoner picks a
   * winner: when two candidates have equal `score`, the policy's source
   * order wins (first contributor's candidate beats later contributors).
   */
  score: number;
  /** Origin of this candidate — helps debugging and trace inspection. */
  source: 'needs' | 'task' | 'reactive' | 'plugin' | (string & {});
}
