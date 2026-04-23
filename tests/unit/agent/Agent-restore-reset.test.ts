import { describe, expect, it, vi } from 'vitest';
import { Agent, type AgentDependencies } from '../../../src/agent/Agent.js';
import type { AgentIdentity } from '../../../src/agent/AgentIdentity.js';
import type { AgentSnapshot } from '../../../src/persistence/AgentSnapshot.js';
import type { Reasoner } from '../../../src/cognition/reasoning/Reasoner.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';
import { SeededRng } from '../../../src/ports/SeededRng.js';

function baseDeps(overrides: Partial<AgentDependencies> = {}): AgentDependencies {
  const identity: AgentIdentity = {
    id: 'whiskers',
    name: 'Whiskers',
    version: '0.0.0',
    role: 'npc',
    species: 'cat',
  };
  return {
    identity,
    eventBus: new InMemoryEventBus(),
    clock: new ManualClock(1_000),
    rng: new SeededRng('seed'),
    ...overrides,
  };
}

/**
 * Build an agent + snapshot pair whose restore() will run catch-up ticks:
 * snapshot is taken at clock t=1000, then the clock advances 2 seconds so
 * restore's catch-up loop has work to do.
 */
function buildSnapshotWithCatchUpWindow(): { agent: Agent; snapshot: AgentSnapshot } {
  const clock = new ManualClock(1_000);
  const agent = new Agent(baseDeps({ clock }));
  const snapshot = agent.snapshot();
  clock.advance(2_000);
  return { agent, snapshot };
}

describe('Agent.restore → Reasoner.reset', () => {
  it('invokes reset() on the live reasoner exactly once, after catch-up ticks', async () => {
    const { agent, snapshot } = buildSnapshotWithCatchUpWindow();

    const callLog: string[] = [];
    const spy = {
      selectIntention: vi.fn(() => {
        callLog.push('select');
        return null;
      }),
      reset: vi.fn(() => {
        callLog.push('reset');
      }),
    } satisfies Required<Reasoner>;

    agent.setReasoner(spy);
    // setReasoner itself fires reset — discard that call before measuring restore.
    spy.reset.mockClear();
    callLog.length = 0;

    await agent.restore(snapshot, { catchUp: true });

    expect(spy.reset).toHaveBeenCalledTimes(1);
    expect(spy.selectIntention).toHaveBeenCalled();
    expect(callLog.at(-1)).toBe('reset');
  });

  it('does not throw when the live reasoner omits reset()', async () => {
    const { agent, snapshot } = buildSnapshotWithCatchUpWindow();
    const resetless: Reasoner = { selectIntention: () => null };
    agent.setReasoner(resetless);

    await expect(agent.restore(snapshot, { catchUp: true })).resolves.not.toThrow();
  });
});
