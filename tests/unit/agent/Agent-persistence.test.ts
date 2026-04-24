import { describe, expect, it } from 'vitest';
import { Agent, type AgentDependencies } from '../../../src/agent/Agent.js';
import { InvalidTimeScaleError } from '../../../src/agent/errors.js';
import type { AgentIdentity } from '../../../src/agent/AgentIdentity.js';
import { AnimationStateMachine } from '../../../src/animation/AnimationStateMachine.js';
import { ANIMATION_TRANSITION } from '../../../src/animation/AnimationTransitionEvent.js';
import type { DomainEvent } from '../../../src/events/DomainEvent.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { MOOD_CHANGED } from '../../../src/events/standardEvents.js';
import { AgeModel } from '../../../src/lifecycle/AgeModel.js';
import { DefaultMoodModel } from '../../../src/mood/DefaultMoodModel.js';
import { Needs } from '../../../src/needs/Needs.js';
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

describe('Agent snapshot/restore — R-01 animation + mood + active skill', () => {
  it('snapshot captures animation state + activeSkillId', () => {
    const anim = new AnimationStateMachine({ skillMap: { feed: 'eating' } });
    const agent = new Agent(baseDeps({ animation: anim }));
    // Simulate a skill becoming active + an animation transition.
    agent.currentActiveSkillId = 'feed';
    anim.reconcile({
      activeSkillId: 'feed',
      modifiers: agent.modifiers,
      wallNowMs: 1_000,
    });

    const snap = agent.snapshot();
    expect(snap.animation).toBeDefined();
    expect(snap.animation?.state).toBe('eating');
    expect(snap.animation?.activeSkillId).toBe('feed');
  });

  it('restore rehydrates animation + activeSkillId without emitting a spurious transition', async () => {
    // Snapshot mid-skill in agent A.
    const animA = new AnimationStateMachine({ skillMap: { feed: 'eating' } });
    const a = new Agent(baseDeps({ animation: animA }));
    a.currentActiveSkillId = 'feed';
    animA.reconcile({ activeSkillId: 'feed', modifiers: a.modifiers, wallNowMs: 1_000 });
    const snap = a.snapshot();

    // Fresh agent B.
    const busB = new InMemoryEventBus();
    const animB = new AnimationStateMachine({ skillMap: { feed: 'eating' } });
    const b = new Agent(baseDeps({ eventBus: busB, animation: animB }));

    const seen: DomainEvent[] = [];
    busB.subscribe((e) => seen.push(e));

    await b.restore(snap);
    expect(b.getState().animation).toBe('eating');
    expect(b.currentActiveSkillId).toBe('feed');

    // First post-restore tick must not emit a redundant AnimationTransition.
    // The reconciler sees activeSkillId: 'feed' and current: 'eating' — no
    // rotation, no event.
    seen.length = 0;
    await b.tick(0.016);
    const animTransitions = seen.filter((e) => e.type === ANIMATION_TRANSITION);
    expect(animTransitions).toEqual([]);
  });

  it('mood carries across snapshot without re-emitting MoodChanged for the same category', async () => {
    const needs = new Needs([
      { id: 'hunger', level: 0.1, decayPerSec: 0, criticalThreshold: 0.2 },
      { id: 'energy', level: 0.8, decayPerSec: 0 },
    ]);

    // Agent A establishes a mood via a real tick.
    const busA = new InMemoryEventBus();
    const a = new Agent(baseDeps({ eventBus: busA, needs, moodModel: new DefaultMoodModel() }));
    await a.tick(0.016);
    const moodA = a.currentMood;
    expect(moodA).toBeDefined();

    const snap = a.snapshot();
    expect(snap.mood?.category).toBe(moodA?.category);

    // Agent B restores.
    const needsB = new Needs([
      { id: 'hunger', level: 0.1, decayPerSec: 0, criticalThreshold: 0.2 },
      { id: 'energy', level: 0.8, decayPerSec: 0 },
    ]);
    const busB = new InMemoryEventBus();
    const b = new Agent(
      baseDeps({
        eventBus: busB,
        needs: needsB,
        moodModel: new DefaultMoodModel(),
      }),
    );
    const seen: DomainEvent[] = [];
    busB.subscribe((e) => seen.push(e));

    await b.restore(snap);
    await b.tick(0.016);

    // A MoodChanged event would only fire if the category rotated. Since the
    // mood was already the correct category post-restore, the first tick
    // must NOT emit MoodChanged.
    const moodEvents = seen.filter((e) => e.type === MOOD_CHANGED);
    expect(moodEvents).toEqual([]);
  });

  it('snapshot without explicit include populates animation by default', () => {
    const agent = new Agent(baseDeps());
    const snap = agent.snapshot();
    expect(snap.animation).toBeDefined();
    expect(snap.animation?.state).toBe('idle');
    expect(snap.animation?.activeSkillId).toBeUndefined();
  });

  it('snapshot with include filter honors the "animation" part key', () => {
    const agent = new Agent(baseDeps());
    const withAnim = agent.snapshot({ include: ['animation'] });
    expect(withAnim.animation).toBeDefined();

    const withoutAnim = agent.snapshot({ include: ['lifecycle'] });
    expect(withoutAnim.animation).toBeUndefined();
  });

  it('R-16: modifier with expiresAt at clock.now drops on restore and emits ModifierExpired once', async () => {
    const clockA = new ManualClock(1_000);
    const a = new Agent(baseDeps({ clock: clockA }));
    // Apply a modifier whose expiresAt is exactly now.
    a.applyModifier({
      id: 'just-expired',
      source: 'test',
      appliedAt: clockA.now(),
      expiresAt: clockA.now(),
      stack: 'replace',
      effects: [],
    });
    const snap = a.snapshot();
    expect(snap.modifiers?.some((m) => m.id === 'just-expired')).toBe(true);

    const busB = new InMemoryEventBus();
    const clockB = new ManualClock(1_000);
    const b = new Agent(baseDeps({ eventBus: busB, clock: clockB }));
    const seen: DomainEvent[] = [];
    busB.subscribe((e) => seen.push(e));

    await b.restore(snap);

    // The modifier is not active on the restored agent.
    expect(b.modifiers.list().map((m) => m.id)).not.toContain('just-expired');

    // Exactly one ModifierExpired fires for the boundary modifier.
    const expiredEvents = seen.filter(
      (e) =>
        e.type === 'ModifierExpired' &&
        (e as { modifierId?: string }).modifierId === 'just-expired',
    );
    expect(expiredEvents).toHaveLength(1);

    // A subsequent tick doesn't re-fire the event.
    seen.length = 0;
    await b.tick(0.016);
    expect(
      seen.filter(
        (e) =>
          e.type === 'ModifierExpired' &&
          (e as { modifierId?: string }).modifierId === 'just-expired',
      ),
    ).toHaveLength(0);
  });

  it('restore replaces (not merges) modifier state — pre-existing modifiers are cleared', async () => {
    // Agent A takes a snapshot carrying exactly one modifier, "from-snap".
    const clockA = new ManualClock(1_000);
    const a = new Agent(baseDeps({ clock: clockA }));
    a.applyModifier({
      id: 'from-snap',
      source: 'test',
      appliedAt: clockA.now(),
      stack: 'replace',
      effects: [],
    });
    const snap = a.snapshot();

    // Agent B starts with two pre-existing modifiers the snapshot does NOT
    // include. Plus one that shares an id with the snapshot's entry so we
    // can assert no duplicate survives.
    const clockB = new ManualClock(1_000);
    const b = new Agent(baseDeps({ clock: clockB }));
    b.applyModifier({
      id: 'pre-existing-A',
      source: 'test',
      appliedAt: clockB.now(),
      stack: 'stack',
      effects: [],
    });
    b.applyModifier({
      id: 'pre-existing-B',
      source: 'test',
      appliedAt: clockB.now(),
      stack: 'stack',
      effects: [],
    });
    b.applyModifier({
      id: 'from-snap',
      source: 'test',
      appliedAt: clockB.now(),
      stack: 'stack',
      effects: [],
    });
    expect(b.modifiers.list().map((m) => m.id)).toEqual([
      'pre-existing-A',
      'pre-existing-B',
      'from-snap',
    ]);

    await b.restore(snap);

    // Only the snapshot's modifier survives. Pre-existing ones are gone,
    // and the id collision does not double up.
    expect(b.modifiers.list().map((m) => m.id)).toEqual(['from-snap']);
  });

  it('restore with no modifiers in snapshot still clears pre-existing modifiers', async () => {
    // Snapshot taken from an agent that never applied any modifier; the
    // modifiers slice may be omitted from the snapshot entirely. Even so,
    // restore must not leave the target agent carrying stale modifiers.
    const a = new Agent(baseDeps());
    const snap = a.snapshot();
    expect(snap.modifiers).toBeUndefined();

    const clockB = new ManualClock(1_000);
    const b = new Agent(baseDeps({ clock: clockB }));
    b.applyModifier({
      id: 'stale',
      source: 'test',
      appliedAt: clockB.now(),
      stack: 'replace',
      effects: [],
    });
    expect(b.modifiers.list().map((m) => m.id)).toContain('stale');

    await b.restore(snap);

    expect(b.modifiers.list()).toEqual([]);
  });
});

describe('Agent snapshot/restore — timeScale round-trip', () => {
  it('snapshot captures the agent’s current timeScale', () => {
    const agent = new Agent(baseDeps({ timeScale: 4 }));
    expect(agent.snapshot().timeScale).toBe(4);

    agent.setTimeScale(8);
    expect(agent.snapshot().timeScale).toBe(8);
  });

  it('restore applies the snapshotted timeScale onto the fresh agent', async () => {
    const a = new Agent(baseDeps({ timeScale: 4 }));
    const snap = a.snapshot();

    const b = new Agent(baseDeps({ timeScale: 1 }));
    expect(b.getTimeScale()).toBe(1);
    await b.restore(snap);
    expect(b.getTimeScale()).toBe(4);
  });

  it('catchUp uses the snapshotted timeScale, not the fresh agent’s constructor value', async () => {
    // Schedule with no transitions in range, so ageSeconds advances freely.
    const schedule = [{ atSeconds: 0, stage: 'adult' as const }];

    // Agent A: scale 4, snapshots at wall-clock t=1000.
    const clockA = new ManualClock(1_000);
    const a = new Agent(
      baseDeps({
        clock: clockA,
        timeScale: 4,
        ageModel: new AgeModel({ bornAt: 0, schedule, initialAgeSeconds: 0 }),
      }),
    );
    const snap = a.snapshot();

    // Agent B: scale 1 constructor value. Fresh clock 2 wall seconds later.
    // Pre-fix: catch-up scaled 2000 ms by 1 → 2 virtual seconds of aging.
    // Post-fix: scales by the snapshotted 4 → 8 virtual seconds.
    const clockB = new ManualClock(3_000);
    const b = new Agent(
      baseDeps({
        clock: clockB,
        timeScale: 1,
        ageModel: new AgeModel({ bornAt: 0, schedule, initialAgeSeconds: 0 }),
      }),
    );

    await b.restore(snap, { catchUp: { chunkVirtualSeconds: 1_000 } });

    expect(b.getTimeScale()).toBe(4);
    expect(b.getState().ageSeconds).toBeCloseTo(8, 9);
  });

  it('setTimeScale(0) with catchUp: true completes cleanly (no NaN, no throw)', async () => {
    // Snapshot at scale 0, then restore into a fresh agent with catchUp.
    // elapsedSec = elapsedMs * 0 = 0, so runCatchUp is a no-op. Contract:
    // no division-by-zero leaks out and the fresh agent adopts scale 0.
    const schedule = [{ atSeconds: 0, stage: 'adult' as const }];
    const clockA = new ManualClock(1_000);
    const a = new Agent(
      baseDeps({
        clock: clockA,
        timeScale: 60,
        ageModel: new AgeModel({ bornAt: 0, schedule, initialAgeSeconds: 0 }),
      }),
    );
    a.setTimeScale(0);
    const snap = a.snapshot();
    expect(snap.timeScale).toBe(0);

    const clockB = new ManualClock(5_000);
    const b = new Agent(
      baseDeps({
        clock: clockB,
        timeScale: 1,
        ageModel: new AgeModel({ bornAt: 0, schedule, initialAgeSeconds: 0 }),
      }),
    );
    await b.restore(snap, { catchUp: true });

    expect(b.getTimeScale()).toBe(0);
    expect(Number.isNaN(b.getState().ageSeconds)).toBe(false);
    expect(b.getState().ageSeconds).toBe(0);
  });

  it('restore rejects a snapshot whose timeScale is corrupted', async () => {
    const a = new Agent(baseDeps({ timeScale: 4 }));
    const snap = a.snapshot();

    const b = new Agent(baseDeps({ timeScale: 1 }));
    await expect(b.restore({ ...snap, timeScale: -1 })).rejects.toBeInstanceOf(
      InvalidTimeScaleError,
    );
    // Failed restore must not have mutated the agent's timeScale.
    expect(b.getTimeScale()).toBe(1);

    const c = new Agent(baseDeps({ timeScale: 1 }));
    await expect(c.restore({ ...snap, timeScale: Number.NaN })).rejects.toBeInstanceOf(
      InvalidTimeScaleError,
    );
    expect(c.getTimeScale()).toBe(1);
  });

  it('pre-v2 snapshots without timeScale keep the restoring agent’s constructor value', async () => {
    // Simulate a legacy snapshot: no timeScale field.
    const a = new Agent(baseDeps({ timeScale: 4 }));
    const { timeScale: _dropped, ...legacy } = a.snapshot();
    void _dropped;

    const b = new Agent(baseDeps({ timeScale: 2 }));
    await b.restore(legacy);
    expect(b.getTimeScale()).toBe(2);
  });
});
