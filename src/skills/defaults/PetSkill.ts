import { ok, type Result } from '../../agent/result.js';
import { SKILL_DEFAULTS } from '../../cognition/tuning.js';
import { defineModifier } from '../../modifiers/defineModifier.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';
import { effectivenessFor } from './effectiveness.js';

const happyGlow = defineModifier({
  id: 'happy-glow',
  source: 'skill:pet',
  stack: 'refresh',
  durationSeconds: SKILL_DEFAULTS.pet.happyGlowDurationSeconds,
  effects: [
    {
      target: { type: 'mood-bias', category: 'playful' },
      kind: 'add',
      value: SKILL_DEFAULTS.pet.happyGlowMoodBias,
    },
  ],
  visual: { hudIcon: 'icon-happy', fxHint: 'hearts-soft' },
});

/**
 * Default `pet` skill. A gentler cousin of `play` — smaller happiness
 * bump, no energy cost, same refresh of the `happy-glow` buff.
 */
export const PetSkill: Skill = {
  id: 'pet',
  label: 'Pet',
  baseEffectiveness: 1,
  execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
    const effectiveness = effectivenessFor(PetSkill, ctx);
    ctx.satisfyNeed('happiness', SKILL_DEFAULTS.pet.happinessSatisfy * effectiveness);
    ctx.applyModifier(happyGlow.instantiate(ctx.clock.now()));
    return Promise.resolve(ok({ fxHint: 'hearts-soft', effectiveness }));
  },
};
