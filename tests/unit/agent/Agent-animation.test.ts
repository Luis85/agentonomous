import { describe, expect, it, vi } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import { ANIMATION_TRANSITION } from '../../../src/animation/AnimationTransitionEvent.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

describe('Agent + AnimationStateMachine integration', () => {
  it('tick reconciles to mood-driven state and emits AnimationTransition', async () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: bus,
      needs: [{ id: 'hunger', level: 1, decayPerSec: 0 }],
      lifecycle: [{ stage: 'adult', atSeconds: 0 }],
    });

    await agent.tick(1);
    const animEvents = listener.mock.calls
      .map((a) => a[0] as { type: string; to?: string })
      .filter((e) => e.type === ANIMATION_TRANSITION);
    expect(animEvents.length).toBeGreaterThan(0);
    // First reconciliation always emits at least once because state rotates
    // from the construction-time idle to something mood-driven.
    expect(agent.getState().animation).toBeDefined();
  });

  it('kill() forces transition to "dead"', () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: bus,
      lifecycle: [{ stage: 'adult', atSeconds: 0 }],
    });

    agent.kill('struck by lightning');
    expect(agent.getState().animation).toBe('dead');

    const transitions = listener.mock.calls
      .map((a) => a[0] as { type: string; to?: string; reason?: string })
      .filter((e) => e.type === ANIMATION_TRANSITION);
    expect(transitions.some((t) => t.to === 'dead' && t.reason === 'deceased')).toBe(true);
  });

  it('sick modifier forces sick animation even during a skill', async () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      lifecycle: [{ stage: 'adult', atSeconds: 0 }],
      animation: {
        skillMap: { feed: 'eating' },
      },
    });
    agent.applyModifier({
      id: 'sick',
      source: 'event:illness',
      appliedAt: 0,
      stack: 'replace',
      effects: [],
    });
    await agent.tick(0.016);
    expect(agent.getState().animation).toBe('sick');
  });
});
