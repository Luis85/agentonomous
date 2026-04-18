import { ok, type Result } from '../../agent/result.js';
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
    ctx.satisfyNeed('energy', 0.8 * effectiveness);
    ctx.satisfyNeed('hunger', -0.1);
    return Promise.resolve(ok({ fxHint: 'zzz', effectiveness }));
  },
};
