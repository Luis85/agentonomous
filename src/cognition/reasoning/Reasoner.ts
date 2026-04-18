import type { Persona } from '../../agent/Persona.js';
import type { DomainEvent } from '../../events/DomainEvent.js';
import type { Modifiers } from '../../modifiers/Modifiers.js';
import type { Needs } from '../../needs/Needs.js';
import type { Intention } from '../Intention.js';
import type { IntentionCandidate } from '../IntentionCandidate.js';

/**
 * Read-only context the Agent passes to its reasoner each tick.
 *
 * Reasoners are pure: `selectIntention(ctx)` yields a single `Intention`
 * (or `null` meaning "nothing worth doing"). Determinism follows from
 * determinism of the inputs — needs, modifiers, persona all behave
 * predictably under fixed seeds.
 */
export interface ReasonerContext {
  perceived: readonly DomainEvent[];
  needs: Needs | undefined;
  modifiers: Modifiers;
  persona?: Persona;
  /**
   * Externally-contributed candidates (from `NeedsPolicy`, reactive
   * handlers, task queues, plugin sources). The reasoner combines these
   * with its own judgement to make a final pick.
   */
  candidates: readonly IntentionCandidate[];
}

export interface Reasoner {
  /** Choose an intention this tick, or `null` for idle. */
  selectIntention(ctx: ReasonerContext): Intention | null;
}
