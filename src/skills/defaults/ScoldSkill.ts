import { err, ok, type Result } from '../../agent/result.js';
import { SKILL_DEFAULTS } from '../../cognition/tuning.js';
import { defineModifier } from '../../modifiers/defineModifier.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';
import { effectivenessFor } from './effectiveness.js';

/**
 * Modifier id the agent must be carrying for `ScoldSkill` to fire.
 * Consumers who want unconditional scolding can either replace the skill
 * or apply a matching modifier manually before invoking.
 */
export const SCOLD_GATE_MODIFIER_ID = 'disobedient';

const scolded = defineModifier({
  id: 'scolded',
  source: 'skill:scold',
  stack: 'replace',
  durationSeconds: SKILL_DEFAULTS.scold.scoldedDurationSeconds,
  effects: [
    {
      target: { type: 'mood-bias', category: 'sad' },
      kind: 'add',
      value: SKILL_DEFAULTS.scold.scoldedMoodBias,
    },
  ],
  visual: { hudIcon: 'icon-scolded', fxHint: 'cloud-gray' },
});

/**
 * Default `scold` skill. Pushes mood toward `sad` and drains a chunk of
 * happiness — a rebuke the reasoner can feel. Gated on the
 * `disobedient` modifier so consumers can only scold when the pet
 * actually misbehaved; invoking without the gate returns
 * `err({ code: 'not-misbehaving' })`. The skill also clears
 * `disobedient` on success so the gate closes behind the scold.
 */
export const ScoldSkill: Skill = {
  id: 'scold',
  label: 'Scold',
  baseEffectiveness: 1,
  execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
    if (!ctx.hasModifier(SCOLD_GATE_MODIFIER_ID)) {
      return Promise.resolve(
        err({
          code: 'not-misbehaving',
          message: `Scold requires the '${SCOLD_GATE_MODIFIER_ID}' modifier; the pet isn't misbehaving.`,
        }),
      );
    }
    const effectiveness = effectivenessFor(ScoldSkill, ctx);
    ctx.applyModifier(scolded.instantiate(ctx.clock.now()));
    ctx.satisfyNeed('happiness', -SKILL_DEFAULTS.scold.happinessCost);
    ctx.removeModifier(SCOLD_GATE_MODIFIER_ID);
    return Promise.resolve(ok({ fxHint: 'cloud-gray', effectiveness }));
  },
};
