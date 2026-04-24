import { describe, expect, it } from 'vitest';
import pkgJson from '../../package.json' with { type: 'json' };

/**
 * Guards the public subpath-export map against accidental renames. If an
 * adapter directory moves, `package.json#exports` falls out of sync, or
 * a consumer-visible entry is dropped, this test fails in CI before the
 * change lands on `develop`.
 *
 * The expected list is the 1.0 contract per
 * `docs/plans/2026-04-19-v1-comprehensive-plan.md#103--narrow-the-public-surface`.
 */
const EXPECTED_SUBPATH_KEYS = [
  '.',
  './integrations/excalibur',
  './cognition/adapters/mistreevous',
  './cognition/adapters/js-son',
  './cognition/adapters/tfjs',
  './package.json',
] as const;

describe('package.json#exports', () => {
  it('lists exactly the 1.0 subpath contract', () => {
    const exports = (pkgJson as { exports: Record<string, unknown> }).exports;
    const actual = Object.keys(exports).sort();
    const expected = [...EXPECTED_SUBPATH_KEYS].sort();
    expect(actual).toEqual(expected);
  });

  it('each non-metadata subpath advertises both import + types', () => {
    const exports = (pkgJson as { exports: Record<string, unknown> }).exports;
    for (const key of EXPECTED_SUBPATH_KEYS) {
      if (key === './package.json') continue;
      const entry = exports[key];
      expect(entry, `subpath ${key} missing from exports map`).toBeTypeOf('object');
      const e = entry as Record<string, unknown>;
      expect(typeof e.import, `subpath ${key} missing 'import' field`).toBe('string');
      expect(typeof e.types, `subpath ${key} missing 'types' field`).toBe('string');
    }
  });
});

describe('public barrel (src/index.ts)', () => {
  it('does not re-export AgentDependencies (consumers go through createAgent)', async () => {
    const mod = (await import('../../src/index.js')) as Record<string, unknown>;
    expect(mod.AgentDependencies).toBeUndefined();
  });

  it('still exports createAgent + Agent + the determinism ports', async () => {
    const mod = (await import('../../src/index.js')) as Record<string, unknown>;
    expect(typeof mod.createAgent).toBe('function');
    expect(typeof mod.Agent).toBe('function');
    expect(typeof mod.SeededRng).toBe('function');
    expect(typeof mod.ManualClock).toBe('function');
  });
});
