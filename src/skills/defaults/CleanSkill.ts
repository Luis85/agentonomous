import { ok, type Result } from '../../agent/result.js';
import { SKILL_DEFAULTS } from '../../cognition/tuning.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';
import { effectivenessFor } from './effectiveness.js';

/**
 * Default `clean` skill. Raises `cleanliness` and strips the `dirty` debuff
 * if present.
 */
export const CleanSkill: Skill = {
  id: 'clean',
  label: 'Clean',
  baseEffectiveness: 1,
  execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
    const effectiveness = effectivenessFor(CleanSkill, ctx);
    ctx.satisfyNeed('cleanliness', SKILL_DEFAULTS.clean.cleanlinessSatisfy * effectiveness);
    ctx.removeModifier('dirty');
    return Promise.resolve(ok({ fxHint: 'bubble-blue', effectiveness }));
  },
};
