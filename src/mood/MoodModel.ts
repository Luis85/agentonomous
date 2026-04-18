import type { Persona } from '../agent/Persona.js';
import type { Modifiers } from '../modifiers/Modifiers.js';
import type { Needs } from '../needs/Needs.js';
import type { Mood } from './Mood.js';

/**
 * Context passed to `MoodModel.evaluate()`. Mood models are pure functions
 * of the agent's state — deterministic under fixed inputs, which keeps
 * snapshot/restore trace equivalence intact.
 */
export interface MoodEvaluationContext {
  needs: Needs | undefined;
  modifiers: Modifiers;
  persona: Persona | undefined;
  wallNowMs: number;
  previous: Mood | undefined;
}

export interface MoodModel {
  evaluate(ctx: MoodEvaluationContext): Mood;
}
