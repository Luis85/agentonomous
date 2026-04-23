import { describe, expect, it, vi } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import type { Reasoner, ReasonerContext } from '../../../src/cognition/reasoning/Reasoner.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

function makeSpyReasoner() {
  return {
    selectIntention: vi.fn((_ctx: ReasonerContext) => null),
    reset: vi.fn(() => undefined),
  } satisfies Required<Reasoner>;
}

function makeAgent() {
  return createAgent({
    id: 'pet',
    species: 'cat',
    clock: new ManualClock(0),
    rng: 0,
    eventBus: new InMemoryEventBus(),
  });
}

describe('Agent.setReasoner → Reasoner.reset', () => {
  it('invokes reset() on the incoming reasoner exactly once, after assignment', () => {
    const agent = makeAgent();
    const incoming = makeSpyReasoner();

    agent.setReasoner(incoming);

    expect(incoming.reset).toHaveBeenCalledTimes(1);
    expect(incoming.selectIntention).not.toHaveBeenCalled();
  });

  it('does NOT invoke reset() on the outgoing reasoner', () => {
    const agent = makeAgent();
    const outgoing = makeSpyReasoner();
    const incoming = makeSpyReasoner();

    agent.setReasoner(outgoing);
    outgoing.reset.mockClear();
    agent.setReasoner(incoming);

    expect(outgoing.reset).not.toHaveBeenCalled();
    expect(incoming.reset).toHaveBeenCalledTimes(1);
  });

  it('fires reset() even when the same reasoner instance is re-set (identity is irrelevant)', () => {
    const agent = makeAgent();
    const spy = makeSpyReasoner();

    agent.setReasoner(spy);
    agent.setReasoner(spy);

    expect(spy.reset).toHaveBeenCalledTimes(2);
  });

  it('does not throw when the incoming reasoner omits reset()', () => {
    const agent = makeAgent();
    const resetless: Reasoner = {
      selectIntention: () => null,
    };

    expect(() => agent.setReasoner(resetless)).not.toThrow();
  });
});
