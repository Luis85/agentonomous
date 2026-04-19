import { describe, expect, it } from 'vitest';
import { defineModifier } from '../../../src/modifiers/defineModifier.js';

describe('defineModifier', () => {
  it('produces a blueprint with instantiate()', () => {
    const blueprint = defineModifier({
      id: 'well-fed',
      source: 'skill:feed',
      stack: 'refresh',
      durationSeconds: 120,
      effects: [{ target: { type: 'need-decay', needId: 'hunger' }, kind: 'multiply', value: 0.5 }],
      visual: { hudIcon: 'icon-wellfed', fxHint: 'sparkle-green' },
    });

    const mod = blueprint.instantiate(1_000);
    expect(mod.id).toBe('well-fed');
    expect(mod.appliedAt).toBe(1_000);
    expect(mod.expiresAt).toBe(1_000 + 120_000);
    expect(mod.stack).toBe('refresh');
    expect(mod.effects).toHaveLength(1);
    expect(mod.visual?.hudIcon).toBe('icon-wellfed');
  });

  it('omits expiresAt when durationSeconds is absent', () => {
    const blueprint = defineModifier({
      id: 'aging',
      source: 'stage:elder',
      stack: 'replace',
      effects: [],
    });
    const mod = blueprint.instantiate(500);
    expect(mod.expiresAt).toBeUndefined();
  });

  it('preserves the visual.label field through instantiate()', () => {
    const blueprint = defineModifier({
      id: 'sick',
      source: 'event:illness',
      stack: 'refresh',
      effects: [],
      visual: { label: 'Sick', hudIcon: '🤒' },
    });
    const mod = blueprint.instantiate(0);
    expect(mod.visual?.label).toBe('Sick');
    expect(mod.visual?.hudIcon).toBe('🤒');
  });

  it('accepts per-instance overrides', () => {
    const blueprint = defineModifier({
      id: 'rng',
      source: 'event:random',
      stack: 'stack',
      effects: [],
    });
    const mod = blueprint.instantiate(0, { source: 'event:special', expiresAt: 42 });
    expect(mod.source).toBe('event:special');
    expect(mod.expiresAt).toBe(42);
  });
});
