import type { LifeStage } from './LifeStage.js';

/**
 * Per-stage capability gates. Consulted by the behavior runner and skill
 * registry (M7) to decide whether a skill can run at the current life stage.
 *
 * Two flavors: allow-list (only these skills are permitted) and deny-list
 * (all except these). Allow-list wins when both are set.
 *
 * Missing stage entries mean "no restrictions" for that stage.
 */
export interface StageCapabilityRule {
  allow?: readonly string[];
  deny?: readonly string[];
}

export type StageCapabilityMap = Readonly<Partial<Record<LifeStage, StageCapabilityRule>>>;

/** Helper: does `stage` permit invoking `skillId`? */
export function stageAllowsSkill(
  caps: StageCapabilityMap | undefined,
  stage: LifeStage,
  skillId: string,
): boolean {
  if (!caps) return true;
  const rule = caps[stage];
  if (!rule) return true;
  if (rule.allow && !rule.allow.includes(skillId)) return false;
  if (rule.deny?.includes(skillId)) return false;
  return true;
}
