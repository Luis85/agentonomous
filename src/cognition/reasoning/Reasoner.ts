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

  /**
   * Clear ephemeral between-tick state so the next tick starts from a
   * known-clean baseline. The kernel invokes this at exactly two points:
   *
   * 1. Immediately after `Agent.setReasoner(next)` — on the **incoming**
   *    reasoner. The outgoing reasoner is discarded without a reset call.
   * 2. At the very end of `Agent.restore(...)`, after the catch-up-tick
   *    loop — on the **live** reasoner. Resetting post-catch-up means the
   *    first live post-restore tick starts fresh regardless of the chunk
   *    size used for catch-up.
   *
   * Never called mid-tick. Implementors should clear plan/BT state and
   * per-tick accumulators. Long-lived architecture — trained network
   * weights, configured policies, persona biases — MUST be preserved.
   * Stateless reasoners can omit this method entirely.
   */
  reset?(): void;
}
