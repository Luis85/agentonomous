import { describe, expect, it, vi } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import { ANIMATION_TRANSITION } from '../../../src/animation/AnimationTransitionEvent.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { MODIFIER_EXPIRED, MOOD_CHANGED } from '../../../src/events/standardEvents.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

describe('Agent pause semantics (setTimeScale(0) — Option A)', () => {
  it('defers ModifierExpired while paused and fires it on the first post-resume tick', async () => {
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

    agent.setTimeScale(0);

    // Advance wall-clock past the modifier's expiresAt while paused.
    clock.set(2_000);
    const pausedTrace = await agent.tick(0.016);

    const pausedTypes = listener.mock.calls.map((a) => (a[0] as { type: string }).type);
    expect(pausedTypes.filter((t) => t === MODIFIER_EXPIRED)).toEqual([]);
    expect(pausedTrace.deltas?.modifiersExpired).toBeUndefined();
    // Modifier remains on the agent during the pause.
    expect(agent.modifiers.has('well-fed')).toBe(true);

    listener.mockClear();

    // Resume. The first post-resume tick detects the expiry and emits.
    agent.setTimeScale(1);
    clock.set(2_100);
    const resumedTrace = await agent.tick(0.016);

    const resumedTypes = listener.mock.calls.map((a) => (a[0] as { type: string }).type);
    expect(resumedTypes.filter((t) => t === MODIFIER_EXPIRED)).toHaveLength(1);
    expect(resumedTrace.deltas?.modifiersExpired).toEqual(['well-fed']);
    expect(agent.modifiers.has('well-fed')).toBe(false);
  });

  it('does not emit MoodChanged while paused', async () => {
    const clock = new ManualClock(0);
    const bus = new InMemoryEventBus();
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock,
      rng: 0,
      eventBus: bus,
      needs: [
        { id: 'hunger', level: 0.9, decayPerSec: 0, criticalThreshold: 0.2 },
        { id: 'energy', level: 0.9, decayPerSec: 0 },
      ],
      lifecycle: [{ stage: 'adult', atSeconds: 0 }],
    });

    // First tick establishes initial mood category.
    await agent.tick(0.016);
    const initialMood = agent.getState().mood?.category;
    expect(initialMood).toBeDefined();

    const listener = vi.fn();
    bus.subscribe(listener);

    // Flip a need into a state that would normally rotate the mood on the
    // next reconciliation tick.
    agent.needs?.restore({ hunger: 0.05, energy: 0.9 });

    agent.setTimeScale(0);
    clock.set(1_000);
    await agent.tick(0.016);

    const types = listener.mock.calls.map((a) => (a[0] as { type: string }).type);
    expect(types.filter((t) => t === MOOD_CHANGED)).toEqual([]);
    // Mood category is latched across the pause.
    expect(agent.getState().mood?.category).toBe(initialMood);
  });

  it('does not emit AnimationTransition while paused', async () => {
    const clock = new ManualClock(0);
    const bus = new InMemoryEventBus();
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock,
      rng: 0,
      eventBus: bus,
      lifecycle: [{ stage: 'adult', atSeconds: 0 }],
    });

    // Warm up — let the first tick run any initial animation rotation.
    await agent.tick(0.016);

    const listener = vi.fn();
    bus.subscribe(listener);

    agent.setTimeScale(0);
    // Applying a modifier that would normally drive a forced animation
    // (e.g. sick) still doesn't emit a transition during the pause.
    agent.applyModifier({
      id: 'sick',
      source: 'event:illness',
      appliedAt: 0,
      stack: 'replace',
      effects: [],
    });
    clock.set(500);
    await agent.tick(0.016);

    const types = listener.mock.calls.map((a) => (a[0] as { type: string }).type);
    expect(types.filter((t) => t === ANIMATION_TRANSITION)).toEqual([]);
  });

  it('resumes reconciliation cleanly on the first tick after scale becomes positive', async () => {
    const clock = new ManualClock(0);
    const bus = new InMemoryEventBus();
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock,
      rng: 0,
      eventBus: bus,
      lifecycle: [{ stage: 'adult', atSeconds: 0 }],
    });
    await agent.tick(0.016);

    agent.setTimeScale(0);
    agent.applyModifier({
      id: 'sick',
      source: 'event:illness',
      appliedAt: 0,
      stack: 'replace',
      effects: [],
    });
    clock.set(500);
    await agent.tick(0.016);

    const listener = vi.fn();
    bus.subscribe(listener);

    agent.setTimeScale(1);
    clock.set(600);
    await agent.tick(0.016);

    // Post-resume, the animation reconciler fires and rotates to 'sick'.
    const animEvents = listener.mock.calls
      .map((a) => a[0] as { type: string; to?: string })
      .filter((e) => e.type === ANIMATION_TRANSITION);
    expect(animEvents.some((e) => e.to === 'sick')).toBe(true);
    expect(agent.getState().animation).toBe('sick');
  });
});
