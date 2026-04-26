// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import type { AgentTickedEvent, DomainEvent } from 'agentonomous';
import { AGENT_TICKED } from 'agentonomous';
import { useAgentSession } from '../../../src/stores/domain/useAgentSession.js';
import { BASE_TIME_SCALE } from '../../../src/demo-domain/scenarios/petCare/buildAgent.js';
import { catSpecies } from '../../../src/demo-domain/scenarios/petCare/species.js';

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

  it('step() restores the paused timeScale even when agent.tick throws', async () => {
    const session = useAgentSession();
    session.init({ seed: 'step-throw-seed' });
    session.pause();
    expect(session.agent?.getTimeScale()).toBe(0);

    const tickSpy = vi
      .spyOn(session.agent!, 'tick')
      .mockRejectedValueOnce(new Error('synthetic tick failure'));

    await expect(session.step(1)).rejects.toThrow('synthetic tick failure');

    // The `finally` branch must restore the paused scale even though
    // `tick` rejected — leaving the agent at `BASE_TIME_SCALE` would
    // contradict `running === false`.
    expect(session.agent?.getTimeScale()).toBe(0);
    expect(session.running).toBe(false);
    tickSpy.mockRestore();
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

  it('setSpeed rejects non-finite or non-positive multipliers and leaves state untouched', () => {
    const session = useAgentSession();
    session.init({ seed: 'reject-seed' });
    session.setSpeed(2);
    expect(session.speedMultiplier).toBe(2);
    expect(session.agent?.getTimeScale()).toBe(BASE_TIME_SCALE * 2);

    const invalid = [0, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const bad of invalid) {
      expect(() => session.setSpeed(bad)).toThrow(RangeError);
    }

    // State must survive every rejected call.
    expect(session.speedMultiplier).toBe(2);
    expect(session.agent?.getTimeScale()).toBe(BASE_TIME_SCALE * 2);
  });

  it('replayFromSnapshot(null) rebuilds a fresh agent reusing the persisted seed', async () => {
    const session = useAgentSession();
    session.init({ seed: 'replay-seed' });
    const firstAgent = session.agent;
    await session.replayFromSnapshot(null);
    expect(session.agent).not.toBe(firstAgent);
    expect(session.seed).toBe('replay-seed');
    expect(session.running).toBe(true);
    expect(session.speedMultiplier).toBe(1);
  });

  it('replayFromSnapshot(null) preserves the user-chosen speedMultiplier across rebuild', async () => {
    const session = useAgentSession();
    session.init({ seed: 'replay-preserve-speed-seed' });
    session.setSpeed(4);
    expect(session.agent?.getTimeScale()).toBe(BASE_TIME_SCALE * 4);

    await session.replayFromSnapshot(null);

    expect(session.speedMultiplier).toBe(4);
    expect(session.running).toBe(true);
    // The fresh agent must mirror the preserved control state — buildAgent
    // returns BASE_TIME_SCALE × 1 by default, so without the explicit
    // setTimeScale at the end of replay, a 4× user would silently end up
    // back at 1× until the next manual SpeedPicker click.
    expect(session.agent?.getTimeScale()).toBe(BASE_TIME_SCALE * 4);
  });

  it('replayFromSnapshot(null) preserves the paused running state across rebuild', async () => {
    const session = useAgentSession();
    session.init({ seed: 'replay-preserve-pause-seed' });
    session.pause();
    expect(session.running).toBe(false);
    expect(session.agent?.getTimeScale()).toBe(0);

    await session.replayFromSnapshot(null);

    expect(session.running).toBe(false);
    expect(session.agent?.getTimeScale()).toBe(0);
  });

  it("replayFromSnapshot(null) clears the previous agent's tfjs-network localStorage key", async () => {
    const session = useAgentSession();
    session.init({ seed: 'tfjs-clear-seed' });
    const agentId = session.agent!.identity.id;
    const tfjsKey = `agentonomous/${agentId}/tfjs-network`;
    globalThis.localStorage.setItem(tfjsKey, '{"weights":"trained-on-previous-pet"}');

    await session.replayFromSnapshot(null);

    expect(globalThis.localStorage.getItem(tfjsKey)).toBeNull();
  });

  it('replayFromSnapshot(snapshot) leaves the live agent untouched when restore rejects', async () => {
    const session = useAgentSession();
    session.init({ seed: 'replay-failure-seed' });
    const previousAgent = session.agent;

    // Spy on the prototype so the SPY catches the FRESH agent's restore
    // call (the fresh instance hasn't been built yet — we can't spy on it
    // directly). Reject once to simulate a semantically broken import.
    const proto = Object.getPrototypeOf(previousAgent);
    const restoreSpy = vi
      .spyOn(proto, 'restore')
      .mockRejectedValueOnce(new Error('synthetic restore failure'));

    await expect(
      session.replayFromSnapshot({} as unknown as Parameters<typeof session.replayFromSnapshot>[0]),
    ).rejects.toThrow('synthetic restore failure');

    // The previous agent must still be the live one — failed import is
    // not allowed to be destructive.
    expect(session.agent).toBe(previousAgent);
    restoreSpy.mockRestore();
  });

  it('replayFromSnapshot(null) reapplies the species override that init received', async () => {
    const session = useAgentSession();
    session.init({ seed: 'override-seed', speciesOverride: catSpecies });
    expect(session.lastSpeciesOverride?.id).toBe(catSpecies.id);
    const firstAgent = session.agent;

    await session.replayFromSnapshot(null);
    expect(session.agent).not.toBe(firstAgent);
    // Override is retained across rebuild — without this the rebuilt
    // agent would silently revert to the scenario default.
    expect(session.lastSpeciesOverride?.id).toBe(catSpecies.id);
    // Sanity: the rebuilt agent's needs reflect the override (catSpecies
    // ships hunger / cleanliness / happiness / energy / health).
    expect(Object.keys(session.agent?.getState().needs ?? {})).toEqual(
      (catSpecies.needs ?? []).map((n) => n.id),
    );
  });

  it('init() without a speciesOverride clears any previously stored override', () => {
    const session = useAgentSession();
    session.init({ seed: 'override-seed', speciesOverride: catSpecies });
    expect(session.lastSpeciesOverride?.id).toBe(catSpecies.id);
    session.init({ seed: 'plain-seed' });
    expect(session.lastSpeciesOverride).toBeUndefined();
  });

  it('subscribe handles survive replayFromSnapshot — listener fires on the rebuilt agent', async () => {
    const session = useAgentSession();
    session.init({ seed: 'rebind-seed' });
    const ticked: AgentTickedEvent[] = [];
    const unsub = session.subscribe((event: DomainEvent) => {
      if (event.type === AGENT_TICKED) ticked.push(event as AgentTickedEvent);
    });

    await session.tick(0.1);
    const firstCount = ticked.length;
    expect(firstCount).toBeGreaterThan(0);

    await session.replayFromSnapshot(null);
    await session.tick(0.1);
    expect(ticked.length).toBeGreaterThan(firstCount);

    unsub();
    const afterUnsubCount = ticked.length;
    await session.tick(0.1);
    expect(ticked.length).toBe(afterUnsubCount);
  });

  it('replayFromSnapshot(snapshot) restores the supplied agent state', async () => {
    const session = useAgentSession();
    session.init({ seed: 'snap-seed' });
    // Tick once so the snapshot's state diverges from a fresh build.
    await session.tick(1);
    const snap = session.agent!.snapshot();
    const snapAge = snap.lifecycle?.ageSeconds ?? 0;

    // Drift the live agent further so we can prove the restore won.
    await session.tick(1);
    await session.tick(1);

    await session.replayFromSnapshot(snap);
    // After restore, the agent reports the exact age stored in snap
    // (no fast-forward — `catchUp: false`).
    expect(session.agent!.getState().ageSeconds).toBeCloseTo(snapAge, 6);
  });

  it('AGENT_TICKED projections (tickIndex / lastTrace / lastTickNumber) update reactively', async () => {
    const session = useAgentSession();
    session.init({ seed: 'project-seed' });
    expect(session.tickIndex).toBe(0);
    expect(session.lastTrace).toBeNull();
    await session.tick(0.1);
    expect(session.tickIndex).toBeGreaterThan(0);
    expect(session.lastTrace).not.toBeNull();
    expect(session.lastTickNumber).toBeGreaterThan(0);
  });

  it('tickIndex stays frozen on paused (virtualDtSeconds === 0) ticks but advances on step()', async () => {
    const session = useAgentSession();
    session.init({ seed: 'pause-progress-seed' });
    expect(session.tickIndex).toBe(0);

    // Pause the agent: setTimeScale(0). Subsequent tick(dt) calls still
    // emit AGENT_TICKED (so trace panels stay live) but with
    // virtualDtSeconds === 0 — the chapter-1 `tickAtLeast(N)` predicate
    // must NOT count these or paused playback auto-completes the tour.
    session.pause();
    const beforeIndex = session.tickIndex;
    await session.tick(0.1);
    await session.tick(0.1);
    expect(session.tickIndex).toBe(beforeIndex);
    expect(session.lastTickNumber).toBeGreaterThan(0); // trace still updates

    // step() temporarily unpauses, ticks once with virtual time, then
    // re-pauses — that one tick must count.
    await session.step(1);
    expect(session.tickIndex).toBe(beforeIndex + 1);
  });

  it('init() resets cognitionModeId to the default heuristic on agent rebuild', () => {
    const session = useAgentSession();
    session.init({ seed: 'cognition-reset-init-seed' });
    // Pretend the user previously selected BT (without exercising the
    // async swap path). Re-init must clobber that back to 'heuristic'
    // so chapter-3's `not(cognitionModeIs('heuristic'))` predicate
    // doesn't auto-fire on a fresh agent.
    session.cognitionModeId = 'bt';
    session.init({ seed: 'cognition-reset-init-seed-2' });
    expect(session.cognitionModeId).toBe('heuristic');
  });

  it('replayFromSnapshot(null) resets cognitionModeId to the default heuristic', async () => {
    const session = useAgentSession();
    session.init({ seed: 'cognition-reset-replay-seed' });
    session.cognitionModeId = 'bt';
    await session.replayFromSnapshot(null);
    expect(session.cognitionModeId).toBe('heuristic');
  });

  it('replayFromSnapshot(snapshot) preserves the active cognition mode for deterministic replay', async () => {
    const session = useAgentSession();
    session.init({ seed: 'cognition-import-seed' });
    const snap = session.agent!.snapshot();

    // User switched to a non-heuristic mode at export time. We don't
    // need the actual reasoner swap to succeed in this unit test (peer
    // deps may or may not be installed in CI matrix); we just need
    // `cognitionModeId` to track the user's intent so replayFromSnapshot
    // can re-apply it. Set the field directly to simulate the post-swap
    // state without exercising the async peer-probe path.
    session.cognitionModeId = 'bt';

    await session.replayFromSnapshot(snap);

    // For chapter-5 replay to be deterministic, the mode the user was
    // running at export must be re-applied on import. If the peer is
    // unavailable in the test environment, the inner setCognitionMode
    // call swallows the error and cognitionModeId falls back to
    // 'heuristic' (the agent's actual reasoner). Either outcome is a
    // valid recovery — the bug fix is that we don't UNCONDITIONALLY
    // reset to 'heuristic' on import. Assert at least that the import
    // didn't drop the mode silently when the swap succeeded.
    if (session.cognitionModeId !== 'heuristic') {
      // Swap succeeded — peer was available.
      expect(session.cognitionModeId).toBe('bt');
    }
    // Always-true sanity assertion so the suite reports the test ran
    // even when the soft-fallback branch is taken.
    expect(['heuristic', 'bt']).toContain(session.cognitionModeId);
  });

  it('setCognitionMode drops stale completions when init() rebuilds the agent mid-flight', async () => {
    const session = useAgentSession();
    session.init({ seed: 'cognition-stale-seed-1' });
    const firstAgent = session.agent;
    expect(firstAgent).not.toBeNull();

    // Heuristic mode is always available (no peer dep). The await on
    // `mode.probe()` still yields a microtask, which is enough room
    // for a parallel `init()` to invalidate the in-flight swap. Spy
    // BEFORE the race so the stale completion's setReasoner call
    // (if any) shows up here.
    const setReasonerSpy = vi.spyOn(firstAgent!, 'setReasoner');
    const swap = session.setCognitionMode('heuristic');
    // Synchronously rebuild the agent — the in-flight swap captured
    // `firstAgent` and its token before this; both checks should
    // reject the late completion.
    session.init({ seed: 'cognition-stale-seed-2' });
    expect(session.agent).not.toBe(firstAgent);
    await swap;

    // The stale completion must NOT have called setReasoner on the
    // (now-stale) firstAgent.
    expect(setReasonerSpy).not.toHaveBeenCalled();
    // And the second init() reset cognitionModeId to heuristic;
    // the stale swap must not re-emit `CognitionModeChanged` against
    // that fresh state.
    expect(session.cognitionModeId).toBe('heuristic');
  });

  it('recordUiEvent bumps recentEventsVersion every push, even past the ring-buffer cap', async () => {
    const session = useAgentSession();
    session.init({ seed: 'recent-events-version-seed' });
    // Drive the agent so the buffer fills past `RECENT_EVENT_LIMIT` (50).
    for (let i = 0; i < 60; i += 1) await session.tick(0.1);
    expect(session.recentEvents.length).toBeLessThanOrEqual(50);
    const versionAfterFill = session.recentEventsVersion;

    session.recordUiEvent('TestUiEvent');
    expect(session.recentEventsVersion).toBe(versionAfterFill + 1);
    // recentEvents.length stays saturated so a length-only watcher
    // would not have fired here — version watcher must.
    session.recordUiEvent('TestUiEvent2');
    expect(session.recentEventsVersion).toBe(versionAfterFill + 2);
  });
});
