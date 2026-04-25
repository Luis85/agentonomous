import { DuplicateSkillError, SkillInvocationError } from '../agent/errors.js';
import type { Result } from '../agent/result.js';
import type { Skill, SkillError, SkillOutcome } from './Skill.js';
import type { SkillContext } from './SkillContext.js';

/**
 * Registry + invoker for skills. Consumers (modules or manual wiring) call
 * `register(skill)`; the Agent calls `invoke(id, params, ctx)` when a
 * behavior action says so.
 *
 * `register()` throws `DuplicateSkillError` if the id is already in the
 * registry — silent overrides were the most common source of "my skill
 * works in isolation but not when I add module X" bugs. Callers that
 * intentionally want to swap a registered skill should call
 * `replace(skill)`.
 */
export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();

  /**
   * Register a skill by its id. Throws `DuplicateSkillError` if the id is
   * already in the registry. Use `replace()` for intentional overrides.
   */
  register(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      throw new DuplicateSkillError(skill.id);
    }
    this.skills.set(skill.id, skill);
  }

  /**
   * Register every skill in `skills` by delegating to `register()`. If a
   * duplicate is encountered, the prior registrations in the batch stay
   * in place and `DuplicateSkillError` propagates — there is no rollback.
   */
  registerAll(skills: readonly Skill[]): void {
    for (const s of skills) this.register(s);
  }

  /**
   * Unconditionally insert or overwrite the skill. The explicit shape for
   * "I intentionally want this id's skill replaced"; `register()` throws
   * in the same scenario so intent is never silent.
   */
  replace(skill: Skill): void {
    this.skills.set(skill.id, skill);
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
   * Invoke a skill by id. Returns the skill's `Result` for domain-level
   * success/failure; infrastructure failures (unregistered id) throw.
   *
   * @throws {SkillInvocationError} If no skill is registered under `id`.
   *   Unregistered invocation is a wiring bug, not a domain error, so it
   *   surfaces as a typed `AgentError` rather than an `err(...)`.
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
