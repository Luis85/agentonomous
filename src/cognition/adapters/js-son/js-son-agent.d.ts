// Ambient type declarations for the optional `js-son-agent` peer dep.
// The upstream package ships pure JavaScript with no `.d.ts`; this file
// covers only the slice our adapter relies on (Agent constructor in
// object form + `next()` + the `Belief` / `Desire` / `Plan` helpers).
declare module 'js-son-agent' {
  export type JsSonBeliefs = Record<string, unknown>;
  export type JsSonDesires = Record<string, (beliefs: JsSonBeliefs) => boolean>;
  export type JsSonIntentions = Record<string, unknown>;
  export type JsSonAction = Record<string, unknown>;

  export interface JsSonPlan {
    head: ((intentions: JsSonIntentions) => boolean) | { isActive: boolean; value?: unknown };
    body: (intentions: JsSonIntentions, ...rest: unknown[]) => readonly JsSonAction[];
    run: (intentions: JsSonIntentions) => readonly JsSonAction[] | null;
  }

  export interface JsSonAgentOptions {
    id: string;
    beliefs: JsSonBeliefs;
    desires?: JsSonDesires;
    plans: readonly JsSonPlan[];
    determinePreferences?: (
      beliefs: JsSonBeliefs,
      desires: JsSonDesires,
    ) => (key: string) => boolean;
    reviseBeliefs?: (current: JsSonBeliefs, updates: JsSonBeliefs) => JsSonBeliefs;
    selfUpdatesPossible?: boolean;
  }

  export class Agent {
    constructor(options: JsSonAgentOptions);
    beliefs: JsSonBeliefs;
    next(beliefUpdates: JsSonBeliefs): readonly (readonly JsSonAction[])[];
  }

  export function Belief(id: string, value: unknown): Record<string, unknown>;
  export function Desire(
    id: string,
    body: (beliefs: JsSonBeliefs) => boolean,
  ): Record<string, (beliefs: JsSonBeliefs) => boolean>;
  export function Plan(
    head: (intentions: JsSonIntentions) => boolean,
    body: (intentions: JsSonIntentions) => readonly JsSonAction[],
  ): JsSonPlan;
}
