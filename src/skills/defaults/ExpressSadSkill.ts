import { ok, type Result } from '../../agent/result.js';
import type { DomainEvent } from '../../events/DomainEvent.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';

/**
 * Expressive reaction: emits a "sad" expression event for renderers to show
 * a glum beat. Does not mutate needs or modifiers.
 */
export const ExpressSadSkill: Skill = {
  id: 'express:sad',
  label: 'Sad',
  execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
    const event: DomainEvent = {
      type: 'ExpressionEmitted',
      at: ctx.clock.now(),
      agentId: ctx.identity.id,
      expression: 'sad',
      fxHint: 'sad-cloud',
    };
    ctx.publishEvent(event);
    return Promise.resolve(ok({ fxHint: 'sad-cloud' }));
  },
};
