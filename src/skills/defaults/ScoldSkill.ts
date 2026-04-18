import { ok, type Result } from '../../agent/result.js';
import { defineModifier } from '../../modifiers/defineModifier.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';
import { effectivenessFor } from './effectiveness.js';

const scolded = defineModifier({
  id: 'scolded',
  source: 'skill:scold',
  stack: 'replace',
  durationSeconds: 60,
  effects: [{ target: { type: 'mood-bias', category: 'sad' }, kind: 'add', value: 0.3 }],
  visual: { hudIcon: 'icon-scolded', fxHint: 'cloud-gray' },
});

/**
 * Default `scold` skill. Pushes mood toward `sad` and drains a chunk of
 * happiness — a rebuke the reasoner can feel.
 */
export const ScoldSkill: Skill = {
  id: 'scold',
  label: 'Scold',
  baseEffectiveness: 1,
  execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
    const effectiveness = effectivenessFor(ScoldSkill, ctx);
    ctx.applyModifier(scolded.instantiate(ctx.clock.now()));
    ctx.satisfyNeed('happiness', -0.3);
    return Promise.resolve(ok({ fxHint: 'cloud-gray', effectiveness }));
  },
};
