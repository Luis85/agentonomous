import { ok, type Result } from '../../agent/result.js';
import { SKILL_DEFAULTS } from '../../cognition/tuning.js';
import { defineModifier } from '../../modifiers/defineModifier.js';
import { SKILL_COMPLETED, type SkillCompletedEvent } from '../../events/standardEvents.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';
import { effectivenessFor } from './effectiveness.js';

const wellFed = defineModifier({
  id: 'well-fed',
  source: 'skill:feed',
  stack: 'refresh',
  durationSeconds: SKILL_DEFAULTS.feed.wellFedDurationSeconds,
  effects: [
    {
      target: { type: 'need-decay', needId: 'hunger' },
      kind: 'multiply',
      value: SKILL_DEFAULTS.feed.wellFedDecayMultiplier,
    },
  ],
  visual: { hudIcon: 'icon-wellfed', fxHint: 'sparkle-green' },
});

/**
 * Default `feed` skill. Raises the `hunger` need and applies a `well-fed`
 * buff that slows hunger decay for 60s.
 */
export const FeedSkill: Skill = {
  id: 'feed',
  label: 'Feed',
  baseEffectiveness: 1,
  execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
    const effectiveness = effectivenessFor(FeedSkill, ctx);
    ctx.satisfyNeed('hunger', SKILL_DEFAULTS.feed.hungerSatisfy * effectiveness);
    ctx.applyModifier(wellFed.instantiate(ctx.clock.now()));
    const completed: SkillCompletedEvent = {
      type: SKILL_COMPLETED,
      at: ctx.clock.now(),
      agentId: ctx.identity.id,
      skillId: FeedSkill.id,
      effectiveness,
    };
    ctx.publishEvent(completed);
    return Promise.resolve(ok({ fxHint: 'sparkle-green', effectiveness }));
  },
};
