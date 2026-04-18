import { ok, type Result } from '../../agent/result.js';
import type { DomainEvent } from '../../events/DomainEvent.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';

/**
 * Expressive reaction: emits a "sleepy" expression event so the host can
 * play a yawn animation or similar. Does not mutate needs or modifiers.
 */
export const ExpressSleepySkill: Skill = {
  id: 'express:sleepy',
  label: 'Sleepy',
  execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
    const event: DomainEvent = {
      type: 'ExpressionEmitted',
      at: ctx.clock.now(),
      agentId: ctx.identity.id,
      expression: 'sleepy',
      fxHint: 'yawn',
    };
    ctx.publishEvent(event);
    return Promise.resolve(ok({ fxHint: 'yawn' }));
  },
};
