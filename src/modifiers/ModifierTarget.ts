/**
 * What a modifier effect acts on.
 *
 * Built-in targets cover needs, mood, skills, intention scoring, locomotion,
 * and lifespan. The escape hatch `(string & {})` lets consumers introduce
 * custom targets (e.g., rendering tints) that their own code knows how to
 * read via `Modifiers.raw()`.
 */
export type ModifierTarget =
  | { type: 'need-decay'; needId: string }
  | { type: 'need-level'; needId: string }
  | { type: 'mood-bias'; category: string }
  | { type: 'skill-effectiveness'; skillId: string }
  | { type: 'intention-score'; intentionType: string }
  | { type: 'locomotion-speed' }
  | { type: 'lifespan' }
  | ({ type: string & {} } & Record<string, unknown>);
