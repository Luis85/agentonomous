import type { Skill } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';

/**
 * Effective multiplier used by defaults. Reads the Modifiers skill-effectiveness
 * if the ctx exposes an `effectivenessFor` helper, otherwise 1.
 */
export function effectivenessFor(skill: Skill, _ctx: SkillContext): number {
  // SkillContext doesn't yet expose modifiers directly; the defaults treat
  // `baseEffectiveness` as the effective multiplier. Agent wiring will multiply
  // the returned `effectiveness` field by modifier effects before emitting
  // SkillCompleted — so this helper simply returns `baseEffectiveness ?? 1`.
  return skill.baseEffectiveness ?? 1;
}
