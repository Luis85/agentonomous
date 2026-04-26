import type { SkillContext } from './SkillContext.js';
import type { Result } from '../agent/result.js';

/**
 * A skill is an atomic capability the agent can invoke. Skills run inside
 * the agent's tick pipeline — they mutate state through the `SkillContext`
 * facade, not directly.
 *
 * The `execute` return type is a `Result<SkillOutcome, SkillError>` so
 * expected failures (no target, missing resource, cooldown still active)
 * surface explicitly; infrastructure failures throw as usual.
 */
export type Skill<Params = Record<string, unknown>> = {
  /** Unique identifier (e.g., `'feed-self'`, `'cry'`, `'express:meow'`). */
  readonly id: string;
  /**
   * Human-readable label for UI. Optional; defaults to the id when
   * rendering HUD/buff bars.
   */
  readonly label?: string;
  /**
   * Per-skill base effectiveness. Multiplied by
   * `modifiers.skillEffectiveness(id)` at invocation time. Default 1.
   */
  readonly baseEffectiveness?: number;

  execute(params: Params | undefined, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>>;
};

/**
 * Payload returned by a successful skill execution. Carries an `fxHint` so
 * renderers can trigger sounds/particles without the skill knowing about
 * the renderer.
 */
export type SkillOutcome = {
  /** Optional rendering hint. */
  fxHint?: string;
  /**
   * Numeric effectiveness actually delivered. Equals
   * `baseEffectiveness * modifiers.skillEffectiveness(id)` by default.
   */
  effectiveness?: number;
  /** Free-form detail for tests + DecisionTrace. */
  details?: Record<string, unknown>;
};

/**
 * Typed failure shape. Skills use `code` strings like
 * `'missing-param'`, `'precondition-failed'`, `'no-target'`.
 */
export type SkillError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};
