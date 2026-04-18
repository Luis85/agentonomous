import { describe, expect, it } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';
import { SeededRng } from '../../../src/ports/SeededRng.js';

describe('createAgent (M2 builder)', () => {
  it('builds a running agent with only id + species', async () => {
    const agent = createAgent({ id: 'whiskers', species: 'cat' });
    const trace = await agent.tick(0.016);
    expect(trace.agentId).toBe('whiskers');
    expect(agent.identity.role).toBe('npc');
    expect(agent.identity.name).toBe('whiskers'); // defaults to id
  });

  it('seeds rng from id by default (identical builds → identical first rolls)', () => {
    const a = createAgent({ id: 'same-id', species: 'cat' });
    const b = createAgent({ id: 'same-id', species: 'cat' });
    const seqA = Array.from({ length: 4 }, () => a.rng.next());
    const seqB = Array.from({ length: 4 }, () => b.rng.next());
    expect(seqA).toEqual(seqB);
  });

  it('accepts a numeric seed and produces a SeededRng', () => {
    const agent = createAgent({ id: 'a', species: 'cat', rng: 42 });
    const other = createAgent({ id: 'b', species: 'dog', rng: 42 });
    // Different ids don't matter when the seed is explicit.
    const seqA = Array.from({ length: 4 }, () => agent.rng.next());
    const seqB = Array.from({ length: 4 }, () => other.rng.next());
    expect(seqA).toEqual(seqB);
  });

  it('passes through explicit Rng / Clock / EventBus', async () => {
    const clock = new ManualClock(500);
    const rng = new SeededRng('explicit');
    const agent = createAgent({ id: 'x', species: 'cat', clock, rng });
    expect(agent.clock).toBe(clock);
    expect(agent.rng).toBe(rng);

    const trace = await agent.tick(0);
    expect(trace.tickStartedAt).toBe(500);
  });

  it('honors role, persona, name, version overrides', () => {
    const agent = createAgent({
      id: 'p1',
      species: 'human',
      role: 'player-proxy',
      name: 'Alice',
      version: '1.2.3',
      persona: { traits: { sociability: 0.9 } },
    });
    expect(agent.identity.role).toBe('player-proxy');
    expect(agent.identity.name).toBe('Alice');
    expect(agent.identity.version).toBe('1.2.3');
    expect(agent.identity.persona?.traits.sociability).toBe(0.9);
  });
});
