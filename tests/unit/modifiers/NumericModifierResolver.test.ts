import { describe, expect, it } from 'vitest';
import type { ModifierEffect } from '../../../src/modifiers/ModifierEffect.js';
import { NumericModifierResolver } from '../../../src/modifiers/NumericModifierResolver.js';

/**
 * All tests target a synthetic `need-decay` stream so the match predicate is
 * a simple type check — the resolver's logic is independent of the target
 * kind being composed.
 */
const matchDecay = (t: { type: string }): boolean => t.type === 'need-decay';

function decay(kind: ModifierEffect['kind'], value: number, needId = 'hunger'): ModifierEffect {
  return { target: { type: 'need-decay', needId }, kind, value };
}

describe('NumericModifierResolver', () => {
  it('returns the identity when there are no effects at all', () => {
    const resolver = new NumericModifierResolver();
    expect(resolver.resolve([], 1, matchDecay)).toBe(1);
    expect(resolver.resolve([], 0, matchDecay)).toBe(0);
  });

  it('returns the identity when no effect matches the predicate', () => {
    const resolver = new NumericModifierResolver();
    const effects: ModifierEffect[] = [
      { target: { type: 'mood-bias', category: 'playful' }, kind: 'add', value: 5 },
    ];
    expect(resolver.resolve(effects, 1, matchDecay)).toBe(1);
    expect(resolver.resolve(effects, 0, matchDecay)).toBe(0);
  });

  it('only-set: a single set effect short-circuits to its value', () => {
    const resolver = new NumericModifierResolver();
    const effects: ModifierEffect[] = [decay('set', 0.25)];
    // Identity is ignored once a `set` effect matched.
    expect(resolver.resolve(effects, 1, matchDecay)).toBe(0.25);
    expect(resolver.resolve(effects, 0, matchDecay)).toBe(0.25);
  });

  it('only-add: sums additive effects on top of additive identity (0)', () => {
    const resolver = new NumericModifierResolver();
    const effects: ModifierEffect[] = [decay('add', 0.3), decay('add', 0.2), decay('add', -0.1)];
    expect(resolver.resolve(effects, 0, matchDecay)).toBeCloseTo(0.4);
  });

  it('only-multiply: multiplies effects against the multiplicative identity (1)', () => {
    const resolver = new NumericModifierResolver();
    const effects: ModifierEffect[] = [decay('multiply', 0.5), decay('multiply', 0.8)];
    expect(resolver.resolve(effects, 1, matchDecay)).toBeCloseTo(0.4);
  });

  it('only-clamp: a clamp effect caps the identity as the ceiling', () => {
    const resolver = new NumericModifierResolver();
    // Matching clamp with identity=1 — the lone matched effect forces matched=true,
    // so the resolver falls through to the base calc: 1 * 1 + 0 = 1, capped at 0.7.
    expect(resolver.resolve([decay('clamp', 0.7)], 1, matchDecay)).toBeCloseTo(0.7);
    // Lowest clamp wins.
    expect(resolver.resolve([decay('clamp', 0.9), decay('clamp', 0.5)], 1, matchDecay)).toBeCloseTo(
      0.5,
    );
  });

  it('combination: set + clamp — set value is still capped by clamp', () => {
    const resolver = new NumericModifierResolver();
    const effects: ModifierEffect[] = [decay('set', 2), decay('clamp', 1.5)];
    expect(resolver.resolve(effects, 1, matchDecay)).toBeCloseTo(1.5);
    // If set is already below the clamp, it wins unchanged.
    expect(resolver.resolve([decay('set', 0.1), decay('clamp', 1.5)], 1, matchDecay)).toBeCloseTo(
      0.1,
    );
  });

  it('combination: set short-circuits multiply and add entirely', () => {
    const resolver = new NumericModifierResolver();
    const effects: ModifierEffect[] = [decay('multiply', 10), decay('add', 100), decay('set', 0.5)];
    expect(resolver.resolve(effects, 1, matchDecay)).toBeCloseTo(0.5);
  });

  it('combination: multiply + add compose as `identity * product + sum`', () => {
    const resolver = new NumericModifierResolver();
    const effects: ModifierEffect[] = [decay('multiply', 0.5), decay('add', 0.25)];
    // 1 * 0.5 + 0.25 = 0.75
    expect(resolver.resolve(effects, 1, matchDecay)).toBeCloseTo(0.75);
  });

  it('combination: multiply + clamp — product is capped', () => {
    const resolver = new NumericModifierResolver();
    const effects: ModifierEffect[] = [
      decay('multiply', 3),
      decay('multiply', 2),
      decay('clamp', 4),
    ];
    // 1 * 6 = 6, clamped to 4.
    expect(resolver.resolve(effects, 1, matchDecay)).toBeCloseTo(4);
  });

  it('combination: add + clamp on additive identity', () => {
    const resolver = new NumericModifierResolver();
    const effects: ModifierEffect[] = [decay('add', 0.6), decay('add', 0.6), decay('clamp', 1)];
    // sum = 1.2, clamped to 1.
    expect(resolver.resolve(effects, 0, matchDecay)).toBeCloseTo(1);
  });

  it('ignores effects whose targets do not match the predicate while composing the rest', () => {
    const resolver = new NumericModifierResolver();
    const effects: ModifierEffect[] = [
      { target: { type: 'mood-bias', category: 'playful' }, kind: 'multiply', value: 0.01 },
      decay('multiply', 0.5),
      { target: { type: 'locomotion-speed' }, kind: 'add', value: 99 },
      decay('add', 0.1),
    ];
    // Only the two decay effects matter: 1 * 0.5 + 0.1 = 0.6.
    expect(resolver.resolve(effects, 1, matchDecay)).toBeCloseTo(0.6);
  });
});
