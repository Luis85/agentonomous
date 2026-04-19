import type { IntentionCandidate } from '../cognition/IntentionCandidate.js';
import { EXPRESSIVE_POLICY_DEFAULTS } from '../cognition/tuning.js';
import type { Persona } from '../agent/Persona.js';
import type { Needs } from './Needs.js';
import type { NeedsPolicy } from './NeedsPolicy.js';

/**
 * Configuration for `ExpressiveNeedsPolicy`.
 *
 * `minUrgency` filters out needs whose urgency is below the threshold —
 * keeps the pet from meowing over trivial hunger. `expressionByNeed` maps
 * need ids to intention type strings (e.g., `hunger → 'express:meow-hungry'`).
 * Omitted mappings fall back to `express:about-<needId>`.
 */
export interface ExpressiveNeedsPolicyOptions {
  /** Urgency floor below which no expression fires. Default: 0.4. */
  minUrgency?: number;
  /** Optional per-need intention type override. */
  expressionByNeed?: Readonly<Record<string, string>>;
}

/** Emits `kind: 'express'` intentions so the pet reacts emotionally. */
export class ExpressiveNeedsPolicy implements NeedsPolicy {
  private readonly minUrgency: number;
  private readonly expressionByNeed: Readonly<Record<string, string>>;

  constructor(opts: ExpressiveNeedsPolicyOptions = {}) {
    this.minUrgency = opts.minUrgency ?? EXPRESSIVE_POLICY_DEFAULTS.minUrgency;
    this.expressionByNeed = opts.expressionByNeed ?? {};
  }

  suggest(needs: Needs, _persona?: Persona): readonly IntentionCandidate[] {
    const out: IntentionCandidate[] = [];
    for (const need of needs.list()) {
      const urgency = needs.urgency(need.id);
      if (urgency < this.minUrgency) continue;
      const type = this.expressionByNeed[need.id] ?? `express:about-${need.id}`;
      out.push({
        intention: { kind: 'express', type, target: need.id },
        score: urgency,
        source: 'needs',
      });
    }
    return out;
  }
}
