import { err, ok, type Result } from '../../agent/result.js';
import { SKILL_DEFAULTS } from '../../cognition/tuning.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';
import { effectivenessFor } from './effectiveness.js';

/**
 * Default `medicate` skill. Requires a `sick` modifier to be attached;
 * on success strips the illness and raises the `health` need.
 */
export const MedicateSkill: Skill = {
  id: 'medicate',
  label: 'Medicate',
  baseEffectiveness: 1,
  execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
    const removed = ctx.removeModifier('sick');
    if (removed === null) {
      return Promise.resolve(err({ code: 'not-sick', message: 'Not sick.' }));
    }
    const effectiveness = effectivenessFor(MedicateSkill, ctx);
    ctx.satisfyNeed('health', SKILL_DEFAULTS.medicate.healthSatisfy * effectiveness);
    return Promise.resolve(ok({ fxHint: 'flash-white', effectiveness }));
  },
};
