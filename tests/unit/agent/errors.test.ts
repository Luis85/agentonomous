import { describe, expect, it } from 'vitest';
import {
  AgentError,
  BudgetExceededError,
  InvalidSpeciesError,
  MissingDependencyError,
  SkillInvocationError,
  SnapshotRestoreError,
} from '../../../src/agent/errors.js';

describe('Agent error hierarchy', () => {
  it('AgentError carries a code and is an Error', () => {
    const err = new AgentError('E_TEST', 'something broke');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('E_TEST');
    expect(err.message).toBe('something broke');
  });

  it('captures a cause when provided', () => {
    const root = new Error('root');
    const err = new AgentError('E_X', 'wrapper', { cause: root });
    expect((err as { cause?: unknown }).cause).toBe(root);
  });

  it.each([
    [MissingDependencyError, 'E_MISSING_DEPENDENCY', ['foo']],
    [SnapshotRestoreError, 'E_SNAPSHOT_RESTORE', ['bad snapshot']],
    [InvalidSpeciesError, 'E_INVALID_SPECIES', ['missing id']],
    [BudgetExceededError, 'E_BUDGET_EXCEEDED', ['over cap']],
  ] as const)('%s uses the expected code', (Ctor, code, args) => {
    const err = new Ctor(...(args as [string]));
    expect(err.code).toBe(code);
    expect(err).toBeInstanceOf(AgentError);
  });

  it('SkillInvocationError retains the skillId', () => {
    const err = new SkillInvocationError('feed', 'no food');
    expect(err.code).toBe('E_SKILL_INVOCATION');
    expect(err.skillId).toBe('feed');
  });
});
