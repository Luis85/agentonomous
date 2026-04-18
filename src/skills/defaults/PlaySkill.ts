import { ok, type Result } from '../../agent/result.js';
import { defineModifier } from '../../modifiers/defineModifier.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';
import { effectivenessFor } from './effectiveness.js';

const happyGlow = defineModifier({
  id: 'happy-glow',
  source: 'skill:play',
  stack: 'refresh',
  durationSeconds: 30,
  effects: [{ target: { type: 'mood-bias', category: 'playful' }, kind: 'add', value: 0.4 }],
  visual: { hudIcon: 'icon-happy', fxHint: 'hearts-pink' },
});

/**
 * Default `play` skill. Trades a little energy for a happiness bump plus
 * a 30s `happy-glow` modifier biased toward the `playful` mood.
 */
export const PlaySkill: Skill = {
  id: 'play',
  label: 'Play',
  baseEffectiveness: 1,
  execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
    const effectiveness = effectivenessFor(PlaySkill, ctx);
    ctx.satisfyNeed('happiness', 0.5 * effectiveness);
    ctx.satisfyNeed('energy', -0.2 * effectiveness);
    ctx.applyModifier(happyGlow.instantiate(ctx.clock.now()));
    return Promise.resolve(ok({ fxHint: 'hearts-pink', effectiveness }));
  },
};
