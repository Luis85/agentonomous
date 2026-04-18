import { ok, type Result } from '../../agent/result.js';
import type { DomainEvent } from '../../events/DomainEvent.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';

/**
 * Expressive reaction: the agent emits a "meow" expression event that the
 * host can render as a speech bubble or sound effect. No need/mood mutation.
 */
export const ExpressMeowSkill: Skill = {
  id: 'express:meow',
  label: 'Meow',
  execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
    const event: DomainEvent = {
      type: 'ExpressionEmitted',
      at: ctx.clock.now(),
      agentId: ctx.identity.id,
      expression: 'meow',
      fxHint: 'sound-meow',
    };
    ctx.publishEvent(event);
    return Promise.resolve(ok({ fxHint: 'sound-meow' }));
  },
};
