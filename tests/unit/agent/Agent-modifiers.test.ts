import { describe, expect, it, vi } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import {
  MODIFIER_APPLIED,
  MODIFIER_EXPIRED,
  MODIFIER_REMOVED,
} from '../../../src/events/standardEvents.js';
import { defineModifier } from '../../../src/modifiers/defineModifier.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

describe('Agent + Modifiers integration', () => {
  it('applyModifier emits ModifierApplied', () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(100),
      rng: 0,
      eventBus: bus,
    });

    const wellFed = defineModifier({
      id: 'well-fed',
      source: 'skill:feed',
      stack: 'refresh',
      durationSeconds: 10,
      effects: [],
      visual: { fxHint: 'sparkle-green' },
    }).instantiate(100);

    agent.applyModifier(wellFed);

    const events = listener.mock.calls.map((a) => a[0] as { type: string; fxHint?: string });
    expect(events.map((e) => e.type)).toContain(MODIFIER_APPLIED);
    expect(events.find((e) => e.type === MODIFIER_APPLIED)?.fxHint).toBe('sparkle-green');
  });

  it('replace stack policy emits ModifierRemoved for the evicted instance', () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const clock = new ManualClock(100);
    const agent = createAgent({ id: 'pet', species: 'cat', clock, rng: 0, eventBus: bus });

    agent.applyModifier({
      id: 'buff',
      source: 'first',
      appliedAt: 100,
      stack: 'replace',
      effects: [],
    });
    clock.advance(10);
    agent.applyModifier({
      id: 'buff',
      source: 'second',
      appliedAt: 110,
      stack: 'replace',
      effects: [],
    });

    const types = listener.mock.calls.map((a) => (a[0] as { type: string }).type);
    expect(types.filter((t) => t === MODIFIER_REMOVED)).toHaveLength(1);
    expect(types.filter((t) => t === MODIFIER_APPLIED)).toHaveLength(2);
  });

  it('modifier decay multipliers slow needs.tick()', async () => {
    const clock = new ManualClock(0);
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock,
      rng: 0,
      needs: [{ id: 'hunger', level: 1, decayPerSec: 0.1 }],
    });
    agent.applyModifier({
      id: 'well-fed',
      source: 'skill:feed',
      appliedAt: 0,
      stack: 'replace',
      effects: [{ target: { type: 'need-decay', needId: 'hunger' }, kind: 'multiply', value: 0.5 }],
    });

    await agent.tick(1);
    expect(agent.needs?.get('hunger')?.level).toBeCloseTo(0.95); // half decay
  });

  it('tick() expires time-bound modifiers and emits ModifierExpired', async () => {
    const clock = new ManualClock(0);
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock,
      rng: 0,
      eventBus: bus,
    });
    agent.applyModifier({
      id: 'well-fed',
      source: 'skill:feed',
      appliedAt: 0,
      expiresAt: 1_000,
      stack: 'replace',
      effects: [],
    });

    clock.set(2_000);
    const trace = await agent.tick(0.016);

    const types = listener.mock.calls.map((a) => (a[0] as { type: string }).type);
    expect(types.filter((t) => t === MODIFIER_EXPIRED)).toHaveLength(1);
    expect(trace.deltas?.modifiersExpired).toEqual(['well-fed']);
    expect(agent.modifiers.has('well-fed')).toBe(false);
  });

  it('getState surfaces active modifiers', () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
    });
    agent.applyModifier({
      id: 'happy-glow',
      source: 'interaction:pet',
      appliedAt: 0,
      expiresAt: 30_000,
      stack: 'replace',
      effects: [],
    });
    const state = agent.getState();
    expect(state.modifiers).toEqual([{ id: 'happy-glow', expiresAt: 30_000 }]);
  });
});
