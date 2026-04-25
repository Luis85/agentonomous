import type { IntentionCandidate } from '../cognition/IntentionCandidate.js';
import type { Persona } from '../agent/Persona.js';
import type { Needs } from './Needs.js';
import type { NeedsPolicy } from './NeedsPolicy.js';

/**
 * Configuration for `ActiveNeedsPolicy`.
 *
 * `minUrgency` gates suggestion. `satisfierByNeed` maps need ids to the
 * intention type the agent should consider (e.g., `hunger → 'satisfy-need:eat'`).
 * Omitted mappings fall back to `satisfy-need:<needId>`.
 *
 * The policy does not verify preconditions (e.g., "food in inventory") —
 * that's the behavior runner's job in M7+.
 */
export type ActiveNeedsPolicyOptions = {
  /** Urgency floor. Default: 0.3. */
  minUrgency?: number;
  /** Per-need intention type override. */
  satisfierByNeed?: Readonly<Record<string, string>>;
};

/** Emits `kind: 'satisfy'` intentions for self-directed agents. */
export class ActiveNeedsPolicy implements NeedsPolicy {
  private readonly minUrgency: number;
  private readonly satisfierByNeed: Readonly<Record<string, string>>;

  constructor(opts: ActiveNeedsPolicyOptions = {}) {
    this.minUrgency = opts.minUrgency ?? 0.3;
    this.satisfierByNeed = opts.satisfierByNeed ?? {};
  }

  suggest(needs: Needs, _persona?: Persona): readonly IntentionCandidate[] {
    const out: IntentionCandidate[] = [];
    for (const need of needs.list()) {
      const urgency = needs.urgency(need.id);
      if (urgency < this.minUrgency) continue;
      const type = this.satisfierByNeed[need.id] ?? `satisfy-need:${need.id}`;
      out.push({
        intention: { kind: 'satisfy', type, target: need.id },
        score: urgency,
        source: 'needs',
      });
    }
    return out;
  }
}
