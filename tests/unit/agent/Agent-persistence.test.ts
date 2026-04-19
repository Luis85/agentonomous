import { describe, expect, it } from 'vitest';
import { Agent, type AgentDependencies } from '../../../src/agent/Agent.js';
import type { AgentIdentity } from '../../../src/agent/AgentIdentity.js';
import { AnimationStateMachine } from '../../../src/animation/AnimationStateMachine.js';
import { ANIMATION_TRANSITION } from '../../../src/animation/AnimationTransitionEvent.js';
import type { DomainEvent } from '../../../src/events/DomainEvent.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { MOOD_CHANGED } from '../../../src/events/standardEvents.js';
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
});
