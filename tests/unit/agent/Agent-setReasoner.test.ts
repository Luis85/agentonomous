import { describe, expect, it } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import { UrgencyReasoner } from '../../../src/cognition/reasoning/UrgencyReasoner.js';
import type { Reasoner, ReasonerContext } from '../../../src/cognition/reasoning/Reasoner.js';
import type { Intention } from '../../../src/cognition/Intention.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

/** Stub reasoner that records invocations and returns a fixed intention. */
function recordingReasoner(
  id: string,
  intention: Intention | null = null,
): Reasoner & {
  id: string;
  calls: ReasonerContext[];
} {
  const calls: ReasonerContext[] = [];
  return {
    id,
    calls,
    selectIntention(ctx) {
      calls.push(ctx);
      return intention;
    },
  };
}

describe('Agent.setReasoner', () => {
  it('defaults to UrgencyReasoner when none is passed', () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: new InMemoryEventBus(),
    });
    expect(agent.getReasoner()).toBeInstanceOf(UrgencyReasoner);
  });

  it('swaps the reasoner used on the next autonomous tick', async () => {
    const first = recordingReasoner('first');
    const second = recordingReasoner('second');
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: new InMemoryEventBus(),
      reasoner: first,
    });

    await agent.tick(0.016);
    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(0);

    agent.setReasoner(second);
    expect(agent.getReasoner()).toBe(second);

    await agent.tick(0.016);
    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(1);
  });

  it('throws TypeError on null / undefined / malformed reasoner', () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: new InMemoryEventBus(),
    });
    expect(() => agent.setReasoner(null as unknown as Reasoner)).toThrow(TypeError);
    expect(() => agent.setReasoner(undefined as unknown as Reasoner)).toThrow(TypeError);
    expect(() => agent.setReasoner({} as unknown as Reasoner)).toThrow(TypeError);
    expect(() =>
      agent.setReasoner({ selectIntention: 'not a function' } as unknown as Reasoner),
    ).toThrow(TypeError);
  });

  it('leaves the rest of the agent state intact across a swap', async () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: new InMemoryEventBus(),
    });

    await agent.tick(0.5);
    const needsBefore = { ...agent.getState().needs };
    const timeScaleBefore = agent.getTimeScale();

    agent.setReasoner(recordingReasoner('stub'));

    expect(agent.getState().needs).toEqual(needsBefore);
    expect(agent.getTimeScale()).toBe(timeScaleBefore);
  });
});
