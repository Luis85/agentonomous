import { describe, expect, it } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import type { Learner, LearningOutcome } from '../../../src/cognition/learning/Learner.js';
import { NoopLearner } from '../../../src/cognition/learning/NoopLearner.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

/** Stub learner that records every outcome it sees. */
function recordingLearner(): Learner & { calls: LearningOutcome[] } {
  const calls: LearningOutcome[] = [];
  return {
    calls,
    score(outcome) {
      calls.push(outcome);
    },
  };
}

describe('Agent.setLearner', () => {
  it('defaults to NoopLearner when none is passed', () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: new InMemoryEventBus(),
    });
    expect(agent.getLearner()).toBeInstanceOf(NoopLearner);
  });

  it('swaps the learner used by the next tick pipeline', () => {
    const first = recordingLearner();
    const second = recordingLearner();
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: new InMemoryEventBus(),
      learner: first,
    });
    expect(agent.getLearner()).toBe(first);
    agent.setLearner(second);
    expect(agent.getLearner()).toBe(second);
  });

  it('throws TypeError on null / undefined / malformed learner', () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: new InMemoryEventBus(),
    });
    expect(() => agent.setLearner(null as unknown as Learner)).toThrow(TypeError);
    expect(() => agent.setLearner(undefined as unknown as Learner)).toThrow(TypeError);
    expect(() => agent.setLearner({} as unknown as Learner)).toThrow(TypeError);
    expect(() => agent.setLearner({ score: 'not a function' } as unknown as Learner)).toThrow(
      TypeError,
    );
  });

  it('leaves the rest of agent state intact across a swap', async () => {
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
    agent.setLearner(recordingLearner());
    expect(agent.getState().needs).toEqual(needsBefore);
    expect(agent.getTimeScale()).toBe(timeScaleBefore);
  });
});
