import { ok, type Result } from '../../agent/result.js';
import { SKILL_DEFAULTS } from '../../cognition/tuning.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';
import { effectivenessFor } from './effectiveness.js';

/**
 * Default `rest` skill. Restores `energy` with a small `hunger` cost for
 * the quiet metabolic burn.
 */
export const RestSkill: Skill = {
  id: 'rest',
  label: 'Rest',
  baseEffectiveness: 1,
  execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
    const effectiveness = effectivenessFor(RestSkill, ctx);
    ctx.satisfyNeed('energy', SKILL_DEFAULTS.rest.energySatisfy * effectiveness);
    ctx.satisfyNeed('hunger', -SKILL_DEFAULTS.rest.hungerCost);
    return Promise.resolve(ok({ fxHint: 'zzz', effectiveness }));
  },
};
