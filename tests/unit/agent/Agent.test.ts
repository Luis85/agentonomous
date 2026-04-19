import { describe, expect, it, vi } from 'vitest';
import { Agent, type AgentDependencies } from '../../../src/agent/Agent.js';
import type { AgentIdentity } from '../../../src/agent/AgentIdentity.js';
import type { AgentModule } from '../../../src/agent/AgentModule.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';
import { SeededRng } from '../../../src/ports/SeededRng.js';
import { MissingDependencyError } from '../../../src/agent/errors.js';

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
    rng: new SeededRng('whiskers-seed'),
    ...overrides,
  };
}

describe('Agent (M2 shell)', () => {
  it('requires core dependencies', () => {
    expect(
      () => new Agent({ ...baseDeps(), identity: undefined as unknown as AgentIdentity }),
    ).toThrow(MissingDependencyError);
  });

  it('tick() returns a DecisionTrace with stable fields', async () => {
    const clock = new ManualClock(1_000);
    const agent = new Agent(baseDeps({ clock, timeScale: 2 }));

    const trace = await agent.tick(0.5);
    expect(trace.agentId).toBe('whiskers');
    expect(trace.tickStartedAt).toBe(1_000);
    expect(trace.virtualDtSeconds).toBeCloseTo(1.0); // 0.5 * timeScale 2
    expect(trace.controlMode).toBe('autonomous');
    expect(trace.stage).toBe('alive');
    expect(trace.halted).toBe(false);
    expect(trace.perceived).toEqual([]);
    expect(trace.actions).toEqual([]);
  });

  it('drains bus events into perceived on the next tick (not current)', async () => {
    const bus = new InMemoryEventBus();
    const agent = new Agent(baseDeps({ eventBus: bus }));

    bus.publish({ type: 'pokeA', at: 0 });
    bus.publish({ type: 'pokeB', at: 0 });

    const trace = await agent.tick(0.016);
    expect(trace.perceived.map((e) => e.type)).toEqual(['pokeA', 'pokeB']);

    // Next tick — queue is empty.
    const next = await agent.tick(0.016);
    expect(next.perceived).toEqual([]);
  });

  it('interact(verb) publishes an InteractionRequested event', () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const agent = new Agent(baseDeps({ eventBus: bus }));

    agent.interact('feed', { item: 'kibble' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      type: 'InteractionRequested',
      agentId: 'whiskers',
      verb: 'feed',
      params: { item: 'kibble' },
    });
  });

  it('subscribe() forwards to the event bus and returns an unsubscribe', () => {
    const bus = new InMemoryEventBus();
    const agent = new Agent(baseDeps({ eventBus: bus }));
    const seen: string[] = [];
    const unsub = agent.subscribe((e) => seen.push(e.type));

    bus.publish({ type: 'hi', at: 1 });
    unsub();
    bus.publish({ type: 'bye', at: 2 });

    expect(seen).toEqual(['hi']);
  });

  it('getState() returns the M2 state shell', () => {
    const agent = new Agent(baseDeps());
    const state = agent.getState();
    expect(state).toEqual({
      id: 'whiskers',
      stage: 'alive',
      halted: false,
      ageSeconds: 0,
      needs: {},
      modifiers: [],
      animation: 'idle',
    });
  });

  it('dispatches reactive handlers during tick perception', async () => {
    const handler = vi.fn();
    const mod: AgentModule = {
      id: 'test-module',
      reactiveHandlers: [{ on: 'InteractionRequested', handle: handler }],
    };
    const bus = new InMemoryEventBus();
    const agent = new Agent(baseDeps({ eventBus: bus, modules: [mod] }));

    agent.interact('feed');
    await agent.tick(0.016);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      type: 'InteractionRequested',
      verb: 'feed',
    });
  });

  it('dispatches wildcard handlers to every event', async () => {
    const handler = vi.fn();
    const mod: AgentModule = {
      id: 'wildcard',
      reactiveHandlers: [{ on: '*', handle: handler }],
    };
    const bus = new InMemoryEventBus();
    const agent = new Agent(baseDeps({ eventBus: bus, modules: [mod] }));

    bus.publish({ type: 'a', at: 0 });
    bus.publish({ type: 'b', at: 0 });
    await agent.tick(0.016);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('swallows reactive handler errors and logs them', async () => {
    const warn = vi.fn();
    const mod: AgentModule = {
      id: 'broken',
      reactiveHandlers: [
        {
          on: '*',
          handle: () => {
            throw new Error('oh no');
          },
        },
      ],
    };
    const bus = new InMemoryEventBus();
    const agent = new Agent(
      baseDeps({
        eventBus: bus,
        modules: [mod],
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn,
          error: vi.fn(),
        },
      }),
    );

    bus.publish({ type: 'ping', at: 0 });
    const trace = await agent.tick(0.016);
    expect(trace.halted).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('bus + RNG remain consistent after a reactive handler throws', async () => {
    // After a handler throws, a healthy handler on the same event type
    // must still receive subsequent events, and the RNG state must match
    // an equivalent run without any throwing handler (throws consume no
    // RNG draws).
    const healthyA = vi.fn();
    const healthyB = vi.fn();

    async function runWith(
      handlers: NonNullable<AgentModule['reactiveHandlers']>,
    ): Promise<number[]> {
      const bus = new InMemoryEventBus();
      const agent = new Agent(
        baseDeps({
          eventBus: bus,
          rng: new SeededRng('fixed-seed'),
          modules: [{ id: 'scenario', reactiveHandlers: handlers }],
          logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        }),
      );

      bus.publish({ type: 'ping', at: 0 });
      await agent.tick(0.016);
      bus.publish({ type: 'ping', at: 10 });
      await agent.tick(0.016);

      return Array.from({ length: 4 }, () => agent.rng.next());
    }

    const throwing: NonNullable<AgentModule['reactiveHandlers']> = [
      {
        on: 'ping',
        handle: () => {
          throw new Error('oh no');
        },
      },
      { on: 'ping', handle: healthyA },
    ];
    const clean: NonNullable<AgentModule['reactiveHandlers']> = [{ on: 'ping', handle: healthyB }];

    const rngAfterThrow = await runWith(throwing);
    const rngAfterClean = await runWith(clean);

    // Healthy handler still sees both events despite the earlier handler throwing.
    expect(healthyA).toHaveBeenCalledTimes(2);
    // Throws don't touch the RNG → byte-identical sequences.
    expect(rngAfterThrow).toEqual(rngAfterClean);
  });

  it('runs onInstall() for modules at construction', () => {
    const onInstall = vi.fn();
    const mod: AgentModule = { id: 'hook', onInstall };
    const agent = new Agent(baseDeps({ modules: [mod] }));
    // Confirm the facade passed to onInstall has the right identity wired up.
    expect(onInstall).toHaveBeenCalledTimes(1);
    const facade = onInstall.mock.calls[0]?.[0] as { identity: { id: string } } | undefined;
    expect(facade?.identity.id).toBe('whiskers');
    expect(agent).toBeInstanceOf(Agent);
  });

  describe('setTimeScale()', () => {
    it('applies the new scale starting on the next tick', async () => {
      const agent = new Agent(baseDeps({ timeScale: 2 }));
      const first = await agent.tick(0.5);
      expect(first.virtualDtSeconds).toBeCloseTo(1.0); // 0.5 * 2

      agent.setTimeScale(4);
      expect(agent.getTimeScale()).toBe(4);

      const second = await agent.tick(0.5);
      expect(second.virtualDtSeconds).toBeCloseTo(2.0); // 0.5 * 4
    });

    it('treats scale 0 as a freeze: virtual time stops advancing', async () => {
      const agent = new Agent(baseDeps({ timeScale: 60 }));
      agent.setTimeScale(0);
      const trace = await agent.tick(0.25);
      expect(trace.virtualDtSeconds).toBe(0);
      expect(trace.halted).toBe(false);
    });

    it('rejects negative, NaN, and infinite scales', () => {
      const agent = new Agent(baseDeps());
      expect(() => agent.setTimeScale(-1)).toThrow(RangeError);
      expect(() => agent.setTimeScale(Number.NaN)).toThrow(RangeError);
      expect(() => agent.setTimeScale(Number.POSITIVE_INFINITY)).toThrow(RangeError);
      expect(agent.getTimeScale()).toBe(1); // unchanged after rejection
    });
  });
});
