// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import type { AgentTickedEvent, DomainEvent } from 'agentonomous';
import { AGENT_TICKED } from 'agentonomous';
import { useAgentSession } from '../../../src/stores/domain/useAgentSession.js';
import { BASE_TIME_SCALE } from '../../../src/demo-domain/scenarios/petCare/buildAgent.js';

const SEED_STORAGE_KEY = 'demo.v2.session.lastSeed.petCare';

describe('useAgentSession', () => {
  beforeEach(() => {
    setActivePinia(createTestingPinia({ stubActions: false }));
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it('throws when no seed is provided and none is persisted', () => {
    const session = useAgentSession();
    expect(() => session.init({})).toThrow(/no seed/);
  });

  it('initialises the agent with the provided seed and default scenario', () => {
    const session = useAgentSession();
    session.init({ seed: 'test-seed-1' });
    expect(session.agent).not.toBeNull();
    expect(session.seed).toBe('test-seed-1');
    expect(session.scenarioId).toBe('petCare');
    expect(session.speedMultiplier).toBe(1);
    expect(session.running).toBe(true);
  });

  it('persists the seed under demo.v2.session.lastSeed.<scenarioId>', () => {
    const session = useAgentSession();
    session.init({ seed: 'persist-seed' });
    expect(globalThis.localStorage.getItem(SEED_STORAGE_KEY)).toBe('persist-seed');
  });

  it('reuses the persisted seed when init() is called without one', () => {
    globalThis.localStorage.setItem(SEED_STORAGE_KEY, 'replay-stored');
    const session = useAgentSession();
    session.init({});
    expect(session.seed).toBe('replay-stored');
  });

  it('advances the agent on tick(dt) and emits AGENT_TICKED to subscribers', async () => {
    const session = useAgentSession();
    session.init({ seed: 'tick-seed' });
    const ticked: AgentTickedEvent[] = [];
    const unsub = session.subscribe((event: DomainEvent) => {
      if (event.type === AGENT_TICKED) ticked.push(event as AgentTickedEvent);
    });
    await session.tick(0.1);
    unsub();
    expect(ticked.length).toBeGreaterThan(0);
  });

  it('pause() sets timeScale to 0 and resume() restores BASE_TIME_SCALE × multiplier', () => {
    const session = useAgentSession();
    session.init({ seed: 'control-seed' });
    session.pause();
    expect(session.agent?.getTimeScale()).toBe(0);
    expect(session.running).toBe(false);
    session.resume();
    expect(session.agent?.getTimeScale()).toBe(BASE_TIME_SCALE);
    expect(session.running).toBe(true);
  });

  it('step(dt) advances exactly one tick while paused without resuming', async () => {
    const session = useAgentSession();
    session.init({ seed: 'step-seed' });
    session.pause();
    const ticked: AgentTickedEvent[] = [];
    const unsub = session.subscribe((event: DomainEvent) => {
      if (event.type === AGENT_TICKED) ticked.push(event as AgentTickedEvent);
    });
    await session.step(1);
    unsub();
    expect(ticked.length).toBe(1);
    expect(session.running).toBe(false);
    expect(session.agent?.getTimeScale()).toBe(0);
  });

  it('setSpeed(multiplier) scales BASE_TIME_SCALE while running and is dormant while paused', () => {
    const session = useAgentSession();
    session.init({ seed: 'speed-seed' });
    session.setSpeed(4);
    expect(session.agent?.getTimeScale()).toBe(BASE_TIME_SCALE * 4);
    session.pause();
    session.setSpeed(2);
    expect(session.agent?.getTimeScale()).toBe(0);
    expect(session.speedMultiplier).toBe(2);
    session.resume();
    expect(session.agent?.getTimeScale()).toBe(BASE_TIME_SCALE * 2);
  });

  it('replayFromSnapshot(null) rebuilds a fresh agent reusing the persisted seed', () => {
    const session = useAgentSession();
    session.init({ seed: 'replay-seed' });
    const firstAgent = session.agent;
    session.replayFromSnapshot(null);
    expect(session.agent).not.toBe(firstAgent);
    expect(session.seed).toBe('replay-seed');
    expect(session.running).toBe(true);
    expect(session.speedMultiplier).toBe(1);
  });

  it('replayFromSnapshot(snapshot) is deferred to slice 1.2b and throws today', () => {
    const session = useAgentSession();
    session.init({ seed: 'defer-seed' });
    expect(() => session.replayFromSnapshot({ version: 1 })).toThrow(/slice 1\.2b/);
  });
});
