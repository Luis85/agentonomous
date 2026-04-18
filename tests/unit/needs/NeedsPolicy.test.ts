import { describe, expect, it } from 'vitest';
import { ActiveNeedsPolicy } from '../../../src/needs/ActiveNeedsPolicy.js';
import { ComposedNeedsPolicy } from '../../../src/needs/ComposedNeedsPolicy.js';
import { ExpressiveNeedsPolicy } from '../../../src/needs/ExpressiveNeedsPolicy.js';
import { Needs } from '../../../src/needs/Needs.js';

describe('ExpressiveNeedsPolicy', () => {
  it('emits express candidates above the urgency floor', () => {
    const needs = new Needs([
      { id: 'hunger', level: 0.2, decayPerSec: 0 }, // urgency 0.8
      { id: 'energy', level: 0.9, decayPerSec: 0 }, // urgency 0.1
    ]);
    const policy = new ExpressiveNeedsPolicy({ minUrgency: 0.4 });
    const candidates = policy.suggest(needs);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.intention.kind).toBe('express');
    expect(candidates[0]?.intention.type).toBe('express:about-hunger');
    expect(candidates[0]?.score).toBeCloseTo(0.8);
    expect(candidates[0]?.source).toBe('needs');
  });

  it('honors per-need expression overrides', () => {
    const needs = new Needs([{ id: 'hunger', level: 0.1, decayPerSec: 0 }]);
    const policy = new ExpressiveNeedsPolicy({
      expressionByNeed: { hunger: 'express:meow-hungry' },
    });
    const candidates = policy.suggest(needs);
    expect(candidates[0]?.intention.type).toBe('express:meow-hungry');
  });
});

describe('ActiveNeedsPolicy', () => {
  it('emits satisfy candidates above the floor', () => {
    const needs = new Needs([
      { id: 'hunger', level: 0.25, decayPerSec: 0 },
      { id: 'energy', level: 0.8, decayPerSec: 0 },
    ]);
    const policy = new ActiveNeedsPolicy({ minUrgency: 0.3 });
    const candidates = policy.suggest(needs);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.intention.kind).toBe('satisfy');
    expect(candidates[0]?.intention.type).toBe('satisfy-need:hunger');
  });

  it('honors satisfier overrides', () => {
    const needs = new Needs([{ id: 'thirst', level: 0.1, decayPerSec: 0 }]);
    const policy = new ActiveNeedsPolicy({
      satisfierByNeed: { thirst: 'satisfy-need:drink-at-pond' },
    });
    const candidates = policy.suggest(needs);
    expect(candidates[0]?.intention.type).toBe('satisfy-need:drink-at-pond');
    expect(candidates[0]?.intention.target).toBe('thirst');
  });
});

describe('ComposedNeedsPolicy', () => {
  it('concatenates suggestions from all child policies', () => {
    const needs = new Needs([{ id: 'hunger', level: 0.2, decayPerSec: 0 }]);
    const policy = new ComposedNeedsPolicy([
      new ExpressiveNeedsPolicy({ minUrgency: 0 }),
      new ActiveNeedsPolicy({ minUrgency: 0 }),
    ]);
    const candidates = policy.suggest(needs);
    expect(candidates.map((c) => c.intention.kind)).toEqual(['express', 'satisfy']);
  });
});
