import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../src/ports/SeededRng.js';

describe('SeededRng', () => {
  it('produces identical sequences for identical numeric seeds', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    const seqA = Array.from({ length: 16 }, () => a.next());
    const seqB = Array.from({ length: 16 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces identical sequences for identical string seeds', () => {
    const a = new SeededRng('whiskers');
    const b = new SeededRng('whiskers');
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() yields values in [0, 1)', () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 1_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() respects inclusive bounds', () => {
    const rng = new SeededRng('int-bounds');
    for (let i = 0; i < 500; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('int() handles single-value ranges', () => {
    const rng = new SeededRng(0);
    expect(rng.int(5, 5)).toBe(5);
  });

  it('int() rejects inverted bounds', () => {
    const rng = new SeededRng(0);
    expect(() => rng.int(10, 5)).toThrow(RangeError);
    expect(() => rng.int(1.5, 3)).toThrow(TypeError);
  });

  it('chance() clamps edge probabilities', () => {
    const rng = new SeededRng('edge');
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(-1)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    expect(rng.chance(42)).toBe(true);
  });

  it('chance() approximates the target probability over many trials', () => {
    const rng = new SeededRng('stats');
    let hits = 0;
    const trials = 10_000;
    for (let i = 0; i < trials; i++) if (rng.chance(0.3)) hits++;
    const observed = hits / trials;
    // Sanity-level tolerance — mostly catches broken implementations.
    expect(observed).toBeGreaterThan(0.25);
    expect(observed).toBeLessThan(0.35);
  });

  it('pick() returns an element of the array', () => {
    const rng = new SeededRng('pick');
    const items = ['a', 'b', 'c', 'd'] as const;
    for (let i = 0; i < 100; i++) {
      const picked = rng.pick(items);
      expect(items).toContain(picked);
    }
  });

  it('pick() rejects empty arrays', () => {
    const rng = new SeededRng(0);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});
