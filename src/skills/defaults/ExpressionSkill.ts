import { ok, type Result } from '../../agent/result.js';
import type { DomainEvent } from '../../events/DomainEvent.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';

/**
 * Build an "expressive reaction" skill — emits a single
 * `ExpressionEmitted` event with the given `expression` + `fxHint` so the
 * host can render a speech bubble, animation, or sound. Pure event
 * emission; never mutates needs or modifiers.
 *
 * Used by the three default expressive skills (`ExpressMeowSkill`,
 * `ExpressSadSkill`, `ExpressSleepySkill`) — keeps them as one-line
 * declarations sharing the same execution path.
 */
export function createExpressionSkill(
  id: string,
  label: string,
  expression: string,
  fxHint: string,
): Skill {
  return {
    id,
    label,
    execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
      const event: DomainEvent = {
        type: 'ExpressionEmitted',
        at: ctx.clock.now(),
        agentId: ctx.identity.id,
        expression,
        fxHint,
      };
      ctx.publishEvent(event);
      return Promise.resolve(ok({ fxHint }));
    },
  };
}
