import { describe, expect, it, vi } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import {
  AGENT_DIED,
  LIFE_STAGE_CHANGED,
  MOOD_CHANGED,
} from '../../../src/events/standardEvents.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

describe('Agent + lifecycle + mood integration', () => {
  it('ages through stages and emits LifeStageChanged', async () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: bus,
      lifecycle: [
        { stage: 'egg', atSeconds: 0 },
        { stage: 'baby', atSeconds: 10 },
        { stage: 'adult', atSeconds: 50 },
        { stage: 'elder', atSeconds: 200 },
      ],
    });

    expect(agent.getState().stage).toBe('egg');

    // One tick that spans all four stages.
    const trace = await agent.tick(250);

    const stageEvents = listener.mock.calls
      .map((a) => a[0] as { type: string; to?: string })
      .filter((e) => e.type === LIFE_STAGE_CHANGED);

    expect(stageEvents.map((e) => e.to)).toEqual(['baby', 'adult', 'elder']);
    expect(trace.stage).toBe('elder');
  });

  it('emits AgentDied and halts when explicit kill is called', async () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const clock = new ManualClock(1_000);
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock,
      rng: 0,
      eventBus: bus,
      lifecycle: [{ stage: 'adult', atSeconds: 0 }],
    });

    agent.kill('hit by a cart');

    const died = listener.mock.calls
      .map((a) => a[0] as { type: string; cause?: string; reason?: string })
      .find((e) => e.type === AGENT_DIED);
    expect(died?.cause).toBe('explicit');
    expect(died?.reason).toBe('hit by a cart');
    expect(agent.getState().halted).toBe(true);

    // Subsequent ticks return halted traces.
    const trace = await agent.tick(0.016);
    expect(trace.halted).toBe(true);
    expect(trace.stage).toBe('deceased');
  });

  it('emits AgentDied when health drains to 0', async () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: bus,
      needs: [{ id: 'health', level: 0.1, decayPerSec: 0.1 }],
      lifecycle: [{ stage: 'adult', atSeconds: 0 }],
    });

    await agent.tick(2);
    const died = listener.mock.calls
      .map((a) => a[0] as { type: string; cause?: string })
      .find((e) => e.type === AGENT_DIED);
    expect(died?.cause).toBe('health-depleted');
    expect(agent.getState().halted).toBe(true);
  });

  it('populates mood and emits MoodChanged when category rotates', async () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: bus,
      needs: [{ id: 'hunger', level: 1, decayPerSec: 0.2 }],
      lifecycle: [{ stage: 'adult', atSeconds: 0 }],
    });

    // First tick — mood initializes (MoodChanged fires because previous was undefined).
    await agent.tick(1);
    expect(agent.getState().mood?.category).toBeDefined();

    // Drain hunger hard; second tick rotates mood.
    await agent.tick(4); // hunger now ~0.0
    const moodChanges = listener.mock.calls
      .map((a) => a[0] as { type: string })
      .filter((e) => e.type === MOOD_CHANGED);
    expect(moodChanges.length).toBeGreaterThan(0);
  });

  it('getState surfaces ageSeconds and mood', async () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      lifecycle: [{ stage: 'adult', atSeconds: 0 }],
      needs: [{ id: 'hunger', level: 1, decayPerSec: 0 }],
    });
    await agent.tick(5);
    const state = agent.getState();
    expect(state.ageSeconds).toBe(5);
    expect(state.mood).toBeDefined();
  });
});
