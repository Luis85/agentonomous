import { SkillInvocationError } from '../agent/errors.js';
import type { Result } from '../agent/result.js';
import type { Skill, SkillError, SkillOutcome } from './Skill.js';
import type { SkillContext } from './SkillContext.js';

/**
 * Registry + invoker for skills. Consumers (modules or manual wiring) call
 * `register(skill)`; the Agent calls `invoke(id, params, ctx)` when a
 * behavior action says so.
 */
export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();

  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  registerAll(skills: readonly Skill[]): void {
    for (const s of skills) this.register(s);
  }

  has(id: string): boolean {
    return this.skills.has(id);
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  list(): readonly Skill[] {
    return [...this.skills.values()];
  }

  /**
   * Invoke a skill by id. Throws `SkillInvocationError` if the skill isn't
   * registered (infrastructure failure). Returns the skill's `Result` for
   * domain-level success/failure.
   */
  async invoke(
    id: string,
    params: Record<string, unknown> | undefined,
    ctx: SkillContext,
  ): Promise<Result<SkillOutcome, SkillError>> {
    const skill = this.skills.get(id);
    if (!skill) {
      throw new SkillInvocationError(id, `Skill '${id}' is not registered.`);
    }
    return skill.execute(params, ctx);
  }
}
