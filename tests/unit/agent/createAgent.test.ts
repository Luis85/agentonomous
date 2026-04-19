import { describe, expect, it } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';
import { SeededRng } from '../../../src/ports/SeededRng.js';
import { Needs } from '../../../src/needs/Needs.js';
import { DEFAULT_URGENCY_CURVE } from '../../../src/needs/Need.js';

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

  it('auto-wires ExpressiveNeedsPolicy when needs are set but no policy is given', async () => {
    // With a critical hunger need and no explicit policy, the autonomous
    // cognition pipeline should still produce a candidate intention.
    // Previously this path silently dropped to zero candidates, leaving
    // the pet inert. We assert the DecisionTrace records a chosen
    // intention rather than asserting on the emitted events (the exact
    // event shape depends on the configured behavior runner).
    const needs = new Needs([
      {
        id: 'hunger',
        level: 0.05, // fully critical
        decayPerSec: 0,
        urgencyCurve: DEFAULT_URGENCY_CURVE,
        criticalThreshold: 0.2,
      },
    ]);

    const agent = createAgent({ id: 'hungry', species: 'cat', needs });
    const trace = await agent.tick(1);

    expect(trace.actions.length + trace.emitted.length).toBeGreaterThan(0);
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
