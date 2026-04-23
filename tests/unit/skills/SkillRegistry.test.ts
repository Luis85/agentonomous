import { describe, expect, it } from 'vitest';
import { DuplicateSkillError } from '../../../src/agent/errors.js';
import { ok } from '../../../src/agent/result.js';
import type { Skill } from '../../../src/skills/Skill.js';
import { SkillRegistry } from '../../../src/skills/SkillRegistry.js';

/**
 * Build a minimal `Skill` fixture that reports successfully. The registry
 * never runs `execute` in these tests, but the shape needs to satisfy the
 * `Skill` interface.
 */
function stub(id: string): Skill {
  return {
    id,
    execute() {
      return Promise.resolve(ok({ effectiveness: 1 }));
    },
  };
}

describe('SkillRegistry.register', () => {
  it('registers a new skill', () => {
    const r = new SkillRegistry();
    r.register(stub('feed'));
    expect(r.has('feed')).toBe(true);
    expect(r.get('feed')?.id).toBe('feed');
  });

  it('throws DuplicateSkillError when the id is already registered', () => {
    const r = new SkillRegistry();
    r.register(stub('feed'));
    expect(() => r.register(stub('feed'))).toThrowError(DuplicateSkillError);
  });

  it('includes the skill id on the thrown error', () => {
    const r = new SkillRegistry();
    r.register(stub('feed'));
    try {
      r.register(stub('feed'));
    } catch (err) {
      expect(err).toBeInstanceOf(DuplicateSkillError);
      expect((err as DuplicateSkillError).skillId).toBe('feed');
      return;
    }
    throw new Error('expected DuplicateSkillError');
  });
});

describe('SkillRegistry.registerAll', () => {
  it('registers all when there are no duplicates', () => {
    const r = new SkillRegistry();
    r.registerAll([stub('a'), stub('b'), stub('c')]);
    expect(r.list()).toHaveLength(3);
  });

  it('throws on the first duplicate and leaves earlier registrations in place', () => {
    const r = new SkillRegistry();
    r.register(stub('a'));
    expect(() => r.registerAll([stub('b'), stub('a'), stub('c')])).toThrowError(
      DuplicateSkillError,
    );
    // 'b' was registered before the duplicate 'a' threw; 'c' never ran.
    expect(r.has('b')).toBe(true);
    expect(r.has('c')).toBe(false);
  });
});

describe('SkillRegistry.replace', () => {
  it('overwrites an existing skill without throwing', () => {
    const r = new SkillRegistry();
    const original = stub('feed');
    const override = stub('feed');
    r.register(original);
    r.replace(override);
    expect(r.get('feed')).toBe(override);
  });

  it('adds a skill that was not previously registered', () => {
    const r = new SkillRegistry();
    r.replace(stub('feed'));
    expect(r.has('feed')).toBe(true);
  });
});
