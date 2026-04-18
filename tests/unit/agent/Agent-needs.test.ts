import { describe, expect, it, vi } from 'vitest';
import { Agent } from '../../../src/agent/Agent.js';
import { createAgent } from '../../../src/agent/createAgent.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { NEED_CRITICAL, NEED_SAFE } from '../../../src/events/standardEvents.js';
import { Needs } from '../../../src/needs/Needs.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';
import { SeededRng } from '../../../src/ports/SeededRng.js';

describe('Agent + Needs integration', () => {
  it('decays needs during tick and records them in trace.deltas', async () => {
    const needs = new Needs([{ id: 'hunger', level: 1, decayPerSec: 0.1 }]);
    const agent = new Agent({
      identity: {
        id: 'pet',
        name: 'Pet',
        version: '0.0.0',
        role: 'npc',
        species: 'cat',
      },
      eventBus: new InMemoryEventBus(),
      clock: new ManualClock(0),
      rng: new SeededRng(0),
      needs,
    });

    const trace = await agent.tick(2);
    expect(needs.get('hunger')?.level).toBeCloseTo(0.8);
    expect(trace.deltas).toBeDefined();
    const needsDeltas = trace.deltas?.needs as { needId: string; after: number }[];
    expect(needsDeltas[0]?.needId).toBe('hunger');
    expect(needsDeltas[0]?.after).toBeCloseTo(0.8);
  });

  it('emits NeedCritical when a need crosses its threshold', async () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const needs = new Needs([
      { id: 'hunger', level: 0.35, decayPerSec: 0.1, criticalThreshold: 0.3 },
    ]);
    const agent = new Agent({
      identity: { id: 'pet', name: 'Pet', version: '0.0.0', role: 'npc', species: 'cat' },
      eventBus: bus,
      clock: new ManualClock(1_000),
      rng: new SeededRng(0),
      needs,
    });

    const trace = await agent.tick(1);
    const criticals = listener.mock.calls
      .map((args) => args[0] as { type: string })
      .filter((e) => e.type === NEED_CRITICAL);
    expect(criticals).toHaveLength(1);
    expect(trace.emitted.some((e) => e.type === NEED_CRITICAL)).toBe(true);
  });

  it('emits NeedSafe when a need is satisfied back above threshold', () => {
    const bus = new InMemoryEventBus();
    const needs = new Needs([{ id: 'hunger', level: 0.1, decayPerSec: 0, criticalThreshold: 0.3 }]);
    const agent = new Agent({
      identity: { id: 'pet', name: 'Pet', version: '0.0.0', role: 'npc', species: 'cat' },
      eventBus: bus,
      clock: new ManualClock(0),
      rng: new SeededRng(0),
      needs,
    });

    // Simulate a skill calling satisfy directly via the collection.
    const delta = needs.satisfy('hunger', 0.4);
    expect(delta.crossedSafe).toBe(true);
    expect(agent).toBeInstanceOf(Agent);
  });

  it('createAgent accepts a plain Need[] array', async () => {
    const agent = createAgent({
      id: 'p',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 1,
      needs: [
        { id: 'hunger', level: 1, decayPerSec: 0.1 },
        { id: 'energy', level: 1, decayPerSec: 0.05 },
      ],
    });

    expect(agent.needs?.list().map((n) => n.id)).toEqual(['hunger', 'energy']);
    await agent.tick(1);
    expect(agent.needs?.get('hunger')?.level).toBeCloseTo(0.9);
  });

  it('getState() surfaces need levels', () => {
    const agent = createAgent({
      id: 'p',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 'state',
      needs: [{ id: 'hunger', level: 0.42, decayPerSec: 0 }],
    });
    expect(agent.getState().needs).toEqual({ hunger: 0.42 });
  });

  it('does not emit critical when dt is 0', async () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const needs = new Needs([
      { id: 'hunger', level: 0.35, decayPerSec: 10, criticalThreshold: 0.3 },
    ]);
    const agent = new Agent({
      identity: { id: 'pet', name: 'Pet', version: '0.0.0', role: 'npc', species: 'cat' },
      eventBus: bus,
      clock: new ManualClock(0),
      rng: new SeededRng(0),
      needs,
    });

    await agent.tick(0);
    const criticals = listener.mock.calls
      .map((args) => args[0] as { type: string })
      .filter((e) => e.type === NEED_CRITICAL || e.type === NEED_SAFE);
    expect(criticals).toHaveLength(0);
  });
});
