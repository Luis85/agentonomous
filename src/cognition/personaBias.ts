import type { Persona } from '../agent/Persona.js';
import { PERSONA_TRAIT_WEIGHTS } from './tuning.js';

/**
 * Pure function mapping `(intentionType, persona)` to a bias scalar.
 * UrgencyReasoner uses it as:
 *   `finalScore = candidate.score * (1 + personaBias(type, persona))`
 *
 * Shipped defaults are light — just enough to make persona traits feel
 * meaningful out of the box. Consumers replace via `createAgent({
 * personaBias })` for project-specific behavior.
 *
 * Known persona traits (no enforcement):
 *   - `ambition`     boosts `do-task` intentions.
 *   - `sociability`  boosts `react:greet` / `react:talk` / dialogue verbs.
 *   - `aggression`   boosts `react:attack` / `satisfy-need:dominance`.
 *   - `curiosity`    boosts `explore` / `investigate` intentions.
 *   - `playfulness`  boosts `express:playful` and `satisfy-need:play`.
 */
export type PersonaBiasFn = (intentionType: string, persona: Persona | undefined) => number;

type TraitRule = {
  readonly trait: keyof typeof PERSONA_TRAIT_WEIGHTS;
  readonly matches: (intentionType: string) => boolean;
};

// Data-driven trait → matcher table. Splitting the rules out keeps the
// dispatcher's cyclomatic complexity flat (one branch per match call,
// no matter how many traits ship).
const TRAIT_RULES: readonly TraitRule[] = [
  {
    trait: 'ambition',
    matches: (t) => t === 'do-task' || t.startsWith('do-task:'),
  },
  {
    trait: 'sociability',
    matches: (t) => t.startsWith('react:greet') || t.startsWith('react:talk'),
  },
  {
    trait: 'aggression',
    matches: (t) => t.startsWith('react:attack') || t === 'satisfy-need:dominance',
  },
  {
    trait: 'curiosity',
    matches: (t) => t.startsWith('explore') || t.startsWith('investigate'),
  },
  {
    trait: 'playfulness',
    matches: (t) => t.includes('play'),
  },
];

export const defaultPersonaBias: PersonaBiasFn = (intentionType, persona) => {
  if (!persona) return 0;
  const traits = persona.traits;
  let bias = 0;
  for (const rule of TRAIT_RULES) {
    if (rule.matches(intentionType)) {
      bias += (traits[rule.trait] ?? 0) * PERSONA_TRAIT_WEIGHTS[rule.trait];
    }
  }
  return bias;
};
