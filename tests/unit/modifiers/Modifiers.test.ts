import { describe, expect, it } from 'vitest';
import type { Modifier } from '../../../src/modifiers/Modifier.js';
import { Modifiers } from '../../../src/modifiers/Modifiers.js';

function mod(overrides: Partial<Modifier>): Modifier {
  return {
    id: 'well-fed',
    source: 'skill:feed',
    appliedAt: 0,
    stack: 'replace',
    effects: [],
    ...overrides,
  };
}

describe('Modifiers collection', () => {
  it('apply() appends a new modifier', () => {
    const mods = new Modifiers();
    const result = mods.apply(mod({ id: 'a' }));
    expect(result.applied.id).toBe('a');
    expect(result.removed).toBeNull();
    expect(mods.list()).toHaveLength(1);
  });

  it('stack: replace evicts existing same-id entries', () => {
    const mods = new Modifiers();
    mods.apply(mod({ id: 'a', source: 'first' }));
    const result = mods.apply(mod({ id: 'a', source: 'second', stack: 'replace' }));
    expect(result.removed?.modifier.source).toBe('first');
    expect(result.removed?.reason).toBe('replaced');
    expect(mods.list()).toHaveLength(1);
    expect(mods.list()[0]?.source).toBe('second');
  });

  it('stack: stack keeps both', () => {
    const mods = new Modifiers();
    mods.apply(mod({ id: 'a', source: 'first', stack: 'stack' }));
    mods.apply(mod({ id: 'a', source: 'second', stack: 'stack' }));
    expect(mods.list()).toHaveLength(2);
  });

  it('stack: refresh updates in place', () => {
    const mods = new Modifiers();
    mods.apply(mod({ id: 'a', appliedAt: 0, expiresAt: 100, stack: 'refresh' }));
    const result = mods.apply(mod({ id: 'a', appliedAt: 50, expiresAt: 200, stack: 'refresh' }));
    expect(mods.list()).toHaveLength(1);
    expect(result.applied.appliedAt).toBe(50);
    expect(result.applied.expiresAt).toBe(200);
  });

  it('stack: ignore keeps the original', () => {
    const mods = new Modifiers();
    mods.apply(mod({ id: 'a', source: 'first', stack: 'ignore' }));
    const result = mods.apply(mod({ id: 'a', source: 'second', stack: 'ignore' }));
    expect(result.applied.source).toBe('first');
    expect(mods.list()).toHaveLength(1);
  });

  it('remove() removes the first match', () => {
    const mods = new Modifiers();
    mods.apply(mod({ id: 'a' }));
    const removed = mods.remove('a');
    expect(removed?.id).toBe('a');
    expect(mods.has('a')).toBe(false);
  });

  it('removeAll() removes every match', () => {
    const mods = new Modifiers();
    mods.apply(mod({ id: 'a', stack: 'stack' }));
    mods.apply(mod({ id: 'a', stack: 'stack' }));
    mods.apply(mod({ id: 'b' }));
    const removed = mods.removeAll('a');
    expect(removed).toHaveLength(2);
    expect(mods.list().map((m) => m.id)).toEqual(['b']);
  });

  it('tick() expires modifiers at or before the current wall time', () => {
    const mods = new Modifiers();
    mods.apply(mod({ id: 'short', appliedAt: 0, expiresAt: 100 }));
    mods.apply(mod({ id: 'long', appliedAt: 0, expiresAt: 1_000 }));
    mods.apply(mod({ id: 'permanent', appliedAt: 0 })); // no expiresAt

    const expiredEarly = mods.tick(50);
    expect(expiredEarly).toHaveLength(0);

    const expiredOnTime = mods.tick(100);
    expect(expiredOnTime.map((r) => r.modifier.id)).toEqual(['short']);
    expect(expiredOnTime[0]?.reason).toBe('expired');

    const expiredLater = mods.tick(2_000);
    expect(expiredLater.map((r) => r.modifier.id)).toEqual(['long']);

    expect(mods.list().map((m) => m.id)).toEqual(['permanent']);
  });
});

describe('Modifiers.decayMultiplier', () => {
  it('returns 1 when no matching effect exists', () => {
    expect(new Modifiers().decayMultiplier('hunger')).toBe(1);
  });

  it('multiplies matching multiply effects', () => {
    const mods = new Modifiers();
    mods.apply(
      mod({
        id: 'wf',
        effects: [
          { target: { type: 'need-decay', needId: 'hunger' }, kind: 'multiply', value: 0.5 },
        ],
      }),
    );
    mods.apply(
      mod({
        id: 'cozy',
        stack: 'stack',
        effects: [
          { target: { type: 'need-decay', needId: 'hunger' }, kind: 'multiply', value: 0.8 },
        ],
      }),
    );
    expect(mods.decayMultiplier('hunger')).toBeCloseTo(0.4);
    expect(mods.decayMultiplier('energy')).toBe(1);
  });

  it('set effects short-circuit everything else', () => {
    const mods = new Modifiers();
    mods.apply(
      mod({
        id: 'stasis',
        effects: [
          { target: { type: 'need-decay', needId: 'hunger' }, kind: 'set', value: 0 },
          { target: { type: 'need-decay', needId: 'hunger' }, kind: 'multiply', value: 2 },
        ],
      }),
    );
    expect(mods.decayMultiplier('hunger')).toBe(0);
  });
});

describe('Modifiers.moodBias / skillEffectiveness / intentionBonus / locomotion', () => {
  it('sums additive effects on mood bias', () => {
    const mods = new Modifiers();
    mods.apply(
      mod({
        id: 'glow',
        effects: [
          { target: { type: 'mood-bias', category: 'playful' }, kind: 'add', value: 0.3 },
          { target: { type: 'mood-bias', category: 'playful' }, kind: 'add', value: 0.2 },
        ],
      }),
    );
    expect(mods.moodBias('playful')).toBeCloseTo(0.5);
    expect(mods.moodBias('sad')).toBe(0);
  });

  it('multiplies skill effectiveness', () => {
    const mods = new Modifiers();
    mods.apply(
      mod({
        id: 'sick',
        effects: [
          {
            target: { type: 'skill-effectiveness', skillId: 'feed' },
            kind: 'multiply',
            value: 0.5,
          },
        ],
      }),
    );
    expect(mods.skillEffectiveness('feed')).toBeCloseTo(0.5);
    expect(mods.skillEffectiveness('play')).toBe(1);
  });

  it('adds intention-score bonuses', () => {
    const mods = new Modifiers();
    mods.apply(
      mod({
        id: 'lonely',
        effects: [
          {
            target: { type: 'intention-score', intentionType: 'react:greet' },
            kind: 'add',
            value: 0.4,
          },
        ],
      }),
    );
    expect(mods.intentionBonus('react:greet')).toBeCloseTo(0.4);
    expect(mods.intentionBonus('do-task')).toBe(0);
  });

  it('scales locomotion speed', () => {
    const mods = new Modifiers();
    mods.apply(
      mod({
        id: 'tired',
        effects: [{ target: { type: 'locomotion-speed' }, kind: 'multiply', value: 0.5 }],
      }),
    );
    expect(mods.locomotionSpeedMultiplier()).toBeCloseTo(0.5);
  });
});
