import { ok, type Result } from '../../agent/result.js';
import { defineModifier } from '../../modifiers/defineModifier.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';
import { effectivenessFor } from './effectiveness.js';

const happyGlow = defineModifier({
  id: 'happy-glow',
  source: 'skill:pet',
  stack: 'refresh',
  durationSeconds: 30,
  effects: [{ target: { type: 'mood-bias', category: 'playful' }, kind: 'add', value: 0.4 }],
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
    ctx.satisfyNeed('happiness', 0.3 * effectiveness);
    ctx.applyModifier(happyGlow.instantiate(ctx.clock.now()));
    return Promise.resolve(ok({ fxHint: 'hearts-soft', effectiveness }));
  },
};
