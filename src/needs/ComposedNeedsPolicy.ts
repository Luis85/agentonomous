import type { IntentionCandidate } from '../cognition/IntentionCandidate.js';
import type { Persona } from '../agent/Persona.js';
import type { Needs } from './Needs.js';
import type { NeedsPolicy } from './NeedsPolicy.js';

/**
 * Runs multiple `NeedsPolicy` strategies and concatenates their candidates.
 * Duplicate `intention.type`s are kept (the reasoner picks the highest-scored).
 *
 * Canonical use: an agent that both expresses emotionally AND self-satisfies
 * when it can. Compose `[new ExpressiveNeedsPolicy(), new ActiveNeedsPolicy()]`.
 */
export class ComposedNeedsPolicy implements NeedsPolicy {
  private readonly policies: readonly NeedsPolicy[];

  constructor(policies: readonly NeedsPolicy[]) {
    this.policies = policies;
  }

  suggest(needs: Needs, persona?: Persona): readonly IntentionCandidate[] {
    const out: IntentionCandidate[] = [];
    for (const policy of this.policies) {
      for (const candidate of policy.suggest(needs, persona)) {
        out.push(candidate);
      }
    }
    return out;
  }
}
