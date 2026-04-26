import { ok, type Result, type Skill, type SkillError, type SkillOutcome } from 'agentonomous';

/**
 * No-op skill used as the commit target when the BT cognition mode's
 * reactive interrupt fires on a `surpriseTreat` random event. Exists so
 * the demo's decision-trace panel shows a legible `approach-treat`
 * string during the interrupt window — not to model any pet behaviour.
 *
 * Examples-local: not registered in the library's default module
 * bundle. The demo wires it in `main.ts`.
 */
export const ApproachTreatSkill: Skill = {
  id: 'approach-treat',
  label: 'Approach treat',
  baseEffectiveness: 1,
  execute(): Promise<Result<SkillOutcome, SkillError>> {
    return Promise.resolve(ok({ fxHint: 'sparkle-gold', effectiveness: 1 }));
  },
};
