import { describe, expect, it } from 'vitest';
import { Needs } from '../../../src/needs/Needs.js';

describe('Needs', () => {
  it('registers needs and reports them in order', () => {
    const needs = new Needs([
      { id: 'hunger', level: 1, decayPerSec: 0.1 },
      { id: 'energy', level: 0.5, decayPerSec: 0.05 },
    ]);
    expect(needs.list().map((n) => n.id)).toEqual(['hunger', 'energy']);
    expect(needs.has('hunger')).toBe(true);
    expect(needs.get('missing')).toBeUndefined();
  });

  it('clamps initial levels to [0, 1]', () => {
    const needs = new Needs([
      { id: 'high', level: 1.7, decayPerSec: 0 },
      { id: 'low', level: -0.3, decayPerSec: 0 },
    ]);
    expect(needs.get('high')?.level).toBe(1);
    expect(needs.get('low')?.level).toBe(0);
  });

  it('decays linearly on tick()', () => {
    const needs = new Needs([{ id: 'hunger', level: 1, decayPerSec: 0.1 }]);
    needs.tick(1);
    expect(needs.get('hunger')?.level).toBeCloseTo(0.9);
    needs.tick(2);
    expect(needs.get('hunger')?.level).toBeCloseTo(0.7);
  });

  it('respects an external decay multiplier (Modifiers hook)', () => {
    const needs = new Needs([{ id: 'hunger', level: 1, decayPerSec: 0.1 }]);
    needs.tick(1, (id) => (id === 'hunger' ? 0.5 : 1));
    expect(needs.get('hunger')?.level).toBeCloseTo(0.95);
  });

  it('satisfy() increments level and clamps at 1', () => {
    const needs = new Needs([{ id: 'hunger', level: 0.3, decayPerSec: 0 }]);
    const delta = needs.satisfy('hunger', 0.5);
    expect(needs.get('hunger')?.level).toBeCloseTo(0.8);
    expect(delta.before).toBeCloseTo(0.3);
    expect(delta.after).toBeCloseTo(0.8);

    needs.satisfy('hunger', 10);
    expect(needs.get('hunger')?.level).toBe(1);
  });

  it('satisfy() rejects unknown need ids', () => {
    const needs = new Needs();
    expect(() => needs.satisfy('ghost', 0.1)).toThrow(RangeError);
  });

  it('tick() returns crossedCritical on downward crossing', () => {
    const needs = new Needs([
      { id: 'hunger', level: 0.35, decayPerSec: 0.1, criticalThreshold: 0.3 },
    ]);
    const deltas = needs.tick(1);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]?.crossedCritical).toBe(true);
    expect(deltas[0]?.crossedSafe).toBe(false);
  });

  it('tick() does not double-report crossings on subsequent ticks below threshold', () => {
    const needs = new Needs([
      { id: 'hunger', level: 0.35, decayPerSec: 0.1, criticalThreshold: 0.3 },
    ]);
    needs.tick(1); // crosses critical → level ≈ 0.25
    const next = needs.tick(1); // level ≈ 0.15, still below — must NOT recrossing
    expect(next[0]?.crossedCritical).toBe(false);
  });

  it('satisfy() emits crossedSafe when climbing back over threshold', () => {
    const needs = new Needs([{ id: 'hunger', level: 0.1, decayPerSec: 0, criticalThreshold: 0.3 }]);
    const delta = needs.satisfy('hunger', 0.4);
    expect(delta.crossedSafe).toBe(true);
    expect(delta.crossedCritical).toBe(false);
  });

  it('urgency() defaults to 1 - level', () => {
    const needs = new Needs([{ id: 'hunger', level: 0.25, decayPerSec: 0 }]);
    expect(needs.urgency('hunger')).toBeCloseTo(0.75);
    expect(needs.urgency('nonexistent')).toBe(0);
  });

  it('urgency() honors a custom curve', () => {
    const needs = new Needs([
      {
        id: 'fun',
        level: 0.5,
        decayPerSec: 0,
        urgencyCurve: (level) => (level < 0.5 ? 1 : 0),
      },
    ]);
    expect(needs.urgency('fun')).toBe(0);
    needs.satisfy('fun', -0.2);
    expect(needs.urgency('fun')).toBe(1);
  });

  it('mostUrgent() returns the highest-urgency need above threshold', () => {
    const needs = new Needs([
      { id: 'hunger', level: 0.2, decayPerSec: 0 }, // urgency 0.8
      { id: 'energy', level: 0.6, decayPerSec: 0 }, // urgency 0.4
      { id: 'fun', level: 0.9, decayPerSec: 0 }, // urgency 0.1
    ]);
    expect(needs.mostUrgent()?.id).toBe('hunger');
    expect(needs.mostUrgent(0.5)?.id).toBe('hunger');
    expect(needs.mostUrgent(0.85)).toBeUndefined();
  });

  it('snapshot + restore roundtrips levels', () => {
    const needs = new Needs([
      { id: 'hunger', level: 1, decayPerSec: 0.1 },
      { id: 'energy', level: 0.5, decayPerSec: 0 },
    ]);
    needs.tick(2);
    const snap = needs.snapshot();

    const copy = new Needs([
      { id: 'hunger', level: 0, decayPerSec: 0.1 },
      { id: 'energy', level: 0, decayPerSec: 0 },
    ]);
    copy.restore(snap);
    expect(copy.snapshot()).toEqual(snap);
  });

  it('restore() ignores unknown need ids', () => {
    const needs = new Needs([{ id: 'hunger', level: 0.5, decayPerSec: 0 }]);
    needs.restore({ hunger: 0.8, ghost: 0.2 });
    expect(needs.get('hunger')?.level).toBeCloseTo(0.8);
    expect(needs.has('ghost')).toBe(false);
  });
});
