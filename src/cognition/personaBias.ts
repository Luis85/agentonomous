import type { Persona } from '../agent/Persona.js';

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

export const defaultPersonaBias: PersonaBiasFn = (intentionType, persona) => {
  if (!persona) return 0;
  const traits = persona.traits;
  let bias = 0;

  if (intentionType === 'do-task' || intentionType.startsWith('do-task:')) {
    bias += (traits.ambition ?? 0) * 0.5;
  }
  if (intentionType.startsWith('react:greet') || intentionType.startsWith('react:talk')) {
    bias += (traits.sociability ?? 0) * 0.4;
  }
  if (intentionType.startsWith('react:attack') || intentionType === 'satisfy-need:dominance') {
    bias += (traits.aggression ?? 0) * 0.5;
  }
  if (intentionType.startsWith('explore') || intentionType.startsWith('investigate')) {
    bias += (traits.curiosity ?? 0) * 0.4;
  }
  if (intentionType.includes('play')) {
    bias += (traits.playfulness ?? 0) * 0.4;
  }

  return bias;
};
