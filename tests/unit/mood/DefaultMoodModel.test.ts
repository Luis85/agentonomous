import { describe, expect, it } from 'vitest';
import { Modifiers } from '../../../src/modifiers/Modifiers.js';
import { DefaultMoodModel } from '../../../src/mood/DefaultMoodModel.js';
import { Needs } from '../../../src/needs/Needs.js';

describe('DefaultMoodModel', () => {
  it("returns 'happy' when all needs are high", () => {
    const model = new DefaultMoodModel();
    const needs = new Needs([
      { id: 'hunger', level: 1, decayPerSec: 0 },
      { id: 'energy', level: 0.9, decayPerSec: 0 },
    ]);
    const mood = model.evaluate({
      needs,
      modifiers: new Modifiers(),
      persona: undefined,
      wallNowMs: 100,
      previous: undefined,
    });
    expect(mood.category).toBe('happy');
    expect(mood.valence).toBeGreaterThan(0.8);
    expect(mood.updatedAt).toBe(100);
  });

  it("returns 'playful' when persona.traits.playfulness > 0.6", () => {
    const model = new DefaultMoodModel();
    const needs = new Needs([{ id: 'hunger', level: 1, decayPerSec: 0 }]);
    const mood = model.evaluate({
      needs,
      modifiers: new Modifiers(),
      persona: { traits: { playfulness: 0.8 } },
      wallNowMs: 0,
      previous: undefined,
    });
    expect(mood.category).toBe('playful');
  });

  it("returns 'bored' when average urgency is moderate", () => {
    const model = new DefaultMoodModel();
    const needs = new Needs([
      { id: 'hunger', level: 0.6, decayPerSec: 0 },
      { id: 'energy', level: 0.55, decayPerSec: 0 },
    ]);
    const mood = model.evaluate({
      needs,
      modifiers: new Modifiers(),
      persona: undefined,
      wallNowMs: 0,
      previous: undefined,
    });
    expect(mood.category).toBe('bored');
  });

  it("returns 'sad' when urgency is high", () => {
    const model = new DefaultMoodModel();
    const needs = new Needs([
      { id: 'hunger', level: 0.1, decayPerSec: 0 },
      { id: 'energy', level: 0.2, decayPerSec: 0 },
    ]);
    const mood = model.evaluate({
      needs,
      modifiers: new Modifiers(),
      persona: undefined,
      wallNowMs: 0,
      previous: undefined,
    });
    expect(['sad', 'sick']).toContain(mood.category);
  });

  it("returns 'sick' when the health need is critical", () => {
    const model = new DefaultMoodModel();
    const needs = new Needs([
      { id: 'hunger', level: 1, decayPerSec: 0 },
      { id: 'health', level: 0.05, decayPerSec: 0 },
    ]);
    const mood = model.evaluate({
      needs,
      modifiers: new Modifiers(),
      persona: undefined,
      wallNowMs: 0,
      previous: undefined,
    });
    expect(mood.category).toBe('sick');
  });

  it('modifier mood bias overrides the rule-based pick if strong enough', () => {
    const model = new DefaultMoodModel();
    const mods = new Modifiers();
    mods.apply({
      id: 'caffeine',
      source: 'potion',
      appliedAt: 0,
      stack: 'replace',
      effects: [{ target: { type: 'mood-bias', category: 'playful' }, kind: 'add', value: 1 }],
    });
    const needs = new Needs([{ id: 'hunger', level: 0.55, decayPerSec: 0 }]); // would be 'bored'
    const mood = model.evaluate({
      needs,
      modifiers: mods,
      persona: undefined,
      wallNowMs: 0,
      previous: undefined,
    });
    expect(mood.category).toBe('playful');
  });

  it('preserves updatedAt when category does not change', () => {
    const model = new DefaultMoodModel();
    const needs = new Needs([{ id: 'hunger', level: 1, decayPerSec: 0 }]);
    const mood1 = model.evaluate({
      needs,
      modifiers: new Modifiers(),
      persona: undefined,
      wallNowMs: 50,
      previous: undefined,
    });
    const mood2 = model.evaluate({
      needs,
      modifiers: new Modifiers(),
      persona: undefined,
      wallNowMs: 200,
      previous: mood1,
    });
    expect(mood2.category).toBe(mood1.category);
    expect(mood2.updatedAt).toBe(50);
  });
});
