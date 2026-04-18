import type { Intention } from '../Intention.js';
import type { Reasoner } from './Reasoner.js';

/**
 * Reasoner that never chooses anything. Useful when you want an agent to
 * stand completely inert (scripted cut-scenes, test scenarios) even with
 * needs/modifiers wired up.
 */
export class NoopReasoner implements Reasoner {
  selectIntention(): Intention | null {
    return null;
  }
}
