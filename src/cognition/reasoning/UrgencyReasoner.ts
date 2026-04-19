import { defaultPersonaBias, type PersonaBiasFn } from '../personaBias.js';
import type { Intention } from '../Intention.js';
import type { Reasoner, ReasonerContext } from './Reasoner.js';

/**
 * Default weighted-scoring reasoner. Takes all candidates from the
 * context, applies `personaBias(type, persona)` and
 * `modifiers.intentionBonus(type)`, picks the single highest-scored one
 * above a threshold. If no candidate clears the threshold, returns
 * `null` (the agent is idle this tick).
 *
 * No beliefs, no planning — just weighted scoring. Adequate for the MVP
 * nurture-pet; consumers who want BDI / planning can plug in a richer
 * `Reasoner` implementation through the same port.
 */
export interface UrgencyReasonerOptions {
  /** Minimum weighted score to commit to an intention. Default: 0. */
  threshold?: number;
  /** Override the persona bias function. */
  personaBias?: PersonaBiasFn;
}

export class UrgencyReasoner implements Reasoner {
  private readonly threshold: number;
  private readonly personaBias: PersonaBiasFn;

  constructor(opts: UrgencyReasonerOptions = {}) {
    this.threshold = opts.threshold ?? 0;
    this.personaBias = opts.personaBias ?? defaultPersonaBias;
  }

  selectIntention(ctx: ReasonerContext): Intention | null {
    let best: { score: number; intention: Intention } | null = null;
    for (const cand of ctx.candidates) {
      const baseline = cand.score;
      const personaFactor = 1 + this.personaBias(cand.intention.type, ctx.persona);
      const modifierBonus = ctx.modifiers.intentionBonus(cand.intention.type);
      const finalScore = baseline * personaFactor + modifierBonus;
      if (finalScore < this.threshold) continue;
      if (!best || finalScore > best.score) {
        best = { score: finalScore, intention: cand.intention };
      }
    }
    return best?.intention ?? null;
  }
}
