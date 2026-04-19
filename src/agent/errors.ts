/**
 * Typed error hierarchy for infrastructure / config failures.
 *
 * Domain errors that the caller is expected to recover from (inventory
 * overflow, wallet overdraft, ...) use `Result<T, E>` instead — see
 * `./result.ts`.
 *
 * Every error carries a stable `.code` string so programmatic handling
 * survives refactors and i18n.
 */
export class AgentError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** A required dependency was not supplied to `Agent` / `createAgent`. */
export class MissingDependencyError extends AgentError {
  constructor(dependency: string, message?: string, options?: { cause?: unknown }) {
    super(
      'E_MISSING_DEPENDENCY',
      message ?? `Missing required dependency: '${dependency}'.`,
      options,
    );
    this.name = 'MissingDependencyError';
  }
}

/** A snapshot failed to restore — schema mismatch, missing skill, etc. */
export class SnapshotRestoreError extends AgentError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('E_SNAPSHOT_RESTORE', message, options);
    this.name = 'SnapshotRestoreError';
  }
}

/** A species descriptor was malformed or references unknown resources. */
export class InvalidSpeciesError extends AgentError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('E_INVALID_SPECIES', message, options);
    this.name = 'InvalidSpeciesError';
  }
}

/** A skill blew up during invocation. Wraps the underlying cause. */
export class SkillInvocationError extends AgentError {
  readonly skillId: string;

  constructor(skillId: string, message: string, options?: { cause?: unknown }) {
    super('E_SKILL_INVOCATION', message, options);
    this.name = 'SkillInvocationError';
    this.skillId = skillId;
  }
}

/**
 * An LLM or tool call would exceed its configured budget. Reserved for
 * LLM-tool integrations; unused by the core tick pipeline.
 */
export class BudgetExceededError extends AgentError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('E_BUDGET_EXCEEDED', message, options);
    this.name = 'BudgetExceededError';
  }
}
