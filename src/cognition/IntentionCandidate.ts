import type { Intention } from './Intention.js';

/**
 * Scored candidate produced by a source (needs policy, reactive handler,
 * task queue, ...). The `Reasoner` combines candidates from all sources,
 * applies `personaBias`, and picks the top one.
 */
export interface IntentionCandidate {
  intention: Intention;
  /** Urgency / priority in [0, 1]. Higher is better. */
  score: number;
  /** Origin of this candidate — helps debugging and trace inspection. */
  source: 'needs' | 'task' | 'reactive' | 'plugin' | (string & {});
}
