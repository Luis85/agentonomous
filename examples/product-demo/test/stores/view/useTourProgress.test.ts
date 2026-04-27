// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAgentSession } from '../../../src/stores/domain/useAgentSession.js';
import { useTourProgress } from '../../../src/stores/view/useTourProgress.js';
import {
  STEP_ID_AUTONOMY,
  STEP_ID_COGNITION_SWAP,
  STEP_ID_REPLAY_IMPORT,
  STEP_ID_TRACE_OPEN,
} from '../../../src/copy/tour.js';

const PROGRESS_KEY = 'demo.v2.tour.progress';

const Probe = defineComponent({
  name: 'TourProbe',
  setup() {
    return { tour: useTourProgress(), session: useAgentSession() };
  },
  render() {
    return h('div');
  },
});

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'intro', component: { template: '<div />' } },
      { path: '/play', name: 'play', component: { template: '<div />' } },
      {
        path: '/tour/:step?',
        name: 'tour',
        component: { template: '<div />' },
        props: true,
      },
    ],
  });
}

async function mountWithStores() {
  const pinia = createTestingPinia({ stubActions: false });
  setActivePinia(pinia);
  const router = buildRouter();
  await router.push('/play');
  await router.isReady();
  const wrapper = mount(Probe, { global: { plugins: [pinia, router] } });
  return wrapper;
}

async function mountAtPath(initialPath: string) {
  const pinia = createTestingPinia({ stubActions: false });
  setActivePinia(pinia);
  const router = buildRouter();
  await router.push(initialPath);
  await router.isReady();
  const wrapper = mount(Probe, { global: { plugins: [pinia, router] } });
  return { wrapper, router };
}

describe('useTourProgress', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it('cold-start cursor lands on the graph firstStepId (chapter-1 autonomy)', async () => {
    const wrapper = await mountWithStores();
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    expect(tour.lastStep).toBe(STEP_ID_AUTONOMY);
    expect(tour.completedAt).toBeNull();
    expect(tour.skipped).toEqual([]);
    expect(tour.currentStep?.id).toBe(STEP_ID_AUTONOMY);
  });

  it('next() does not advance until the chapter-1 predicate is satisfied', async () => {
    const wrapper = await mountWithStores();
    const session = (wrapper.vm as unknown as { session: ReturnType<typeof useAgentSession> })
      .session;
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    session.init({ seed: 'tour-noop-seed' });
    expect(tour.next()).toBe(false);
    expect(tour.lastStep).toBe(STEP_ID_AUTONOMY);
  });

  it('next() advances to chapter-2 once the chapter-1 predicate trips', async () => {
    const wrapper = await mountWithStores();
    const session = (wrapper.vm as unknown as { session: ReturnType<typeof useAgentSession> })
      .session;
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    session.init({ seed: 'tour-advance-seed' });
    // Drive ticks so chapter-1's `tickAtLeast(3) AND eventEmittedSince('AGENT_TICKED', 0)`
    // both trip.
    for (let i = 0; i < 4; i += 1) await session.tick(0.1);
    await nextTick();
    expect(tour.next()).toBe(true);
    // Chapter-1 → chapter-2 first step (trace-open). Tour is not over yet.
    expect(tour.lastStep).toBe(STEP_ID_TRACE_OPEN);
    expect(tour.completedAt).toBeNull();
  });

  it('skip() records the step + advances to the next chapter', async () => {
    const wrapper = await mountWithStores();
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    tour.skip();
    expect(tour.skipped).toContain(STEP_ID_AUTONOMY);
    expect(tour.lastStep).toBe(STEP_ID_TRACE_OPEN);
    expect(tour.completedAt).toBeNull();
  });

  it('skip() through every step ends the tour and persists `completedAt`', async () => {
    const wrapper = await mountWithStores();
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    // Skip enough steps to land on the chapter-5 import step (the last
    // step before the TOUR_END sentinel). Eight steps cover all five
    // chapters' content with a small safety margin.
    for (let i = 0; i < 8; i += 1) {
      tour.skip();
      if (tour.completedAt !== null) break;
    }
    expect(tour.skipped).toContain(STEP_ID_AUTONOMY);
    expect(tour.skipped).toContain(STEP_ID_REPLAY_IMPORT);
    expect(tour.completedAt).not.toBeNull();
  });

  it('persists progress under demo.v2.tour.progress and resumes on reconstruction', async () => {
    const wrapper = await mountWithStores();
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    tour.skip();
    const raw = globalThis.localStorage.getItem(PROGRESS_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as {
      lastStep: string;
      completedAt: number | null;
      skipped: string[];
    };
    expect(parsed.skipped).toContain(STEP_ID_AUTONOMY);
    expect(parsed.lastStep).toBe(STEP_ID_TRACE_OPEN);

    // Re-mount: a fresh store reads the persisted record.
    wrapper.unmount();
    const wrapper2 = await mountWithStores();
    const tour2 = (wrapper2.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    expect(tour2.lastStep).toBe(STEP_ID_TRACE_OPEN);
    expect(tour2.skipped).toContain(STEP_ID_AUTONOMY);
  });

  it('restart() clears persisted progress + cursor', async () => {
    const wrapper = await mountWithStores();
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    tour.skip();
    expect(globalThis.localStorage.getItem(PROGRESS_KEY)).not.toBeNull();
    tour.restart();
    expect(tour.completedAt).toBeNull();
    expect(tour.skipped).toEqual([]);
    expect(tour.lastStep).toBe(STEP_ID_AUTONOMY);
    expect(globalThis.localStorage.getItem(PROGRESS_KEY)).toBeNull();
  });

  it('captures session.tickIndex as the step baseline when the cursor advances', async () => {
    const wrapper = await mountWithStores();
    const session = (wrapper.vm as unknown as { session: ReturnType<typeof useAgentSession> })
      .session;
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    session.init({ seed: 'tour-baseline-seed' });

    // Initial baseline is the session tickIndex at `start`.
    tour.start();
    expect(tour.baselineTickIndex).toBe(session.tickIndex);

    // Advance the session a few ticks; baseline should NOT shift until
    // the cursor actually moves.
    for (let i = 0; i < 3; i += 1) await session.tick(0.1);
    await nextTick();
    expect(tour.baselineTickIndex).toBe(0);
    const tickAtSkip = session.tickIndex;

    // Skip moves chapter-1 → chapter-2 first step. The baseline should
    // capture the session's tickIndex at the moment of the cursor move.
    tour.skip();
    expect(tour.lastStep).toBe(STEP_ID_TRACE_OPEN);
    expect(tour.baselineTickIndex).toBe(tickAtSkip);
  });

  it('rebases baselineTickIndex to 0 when session.tickIndex resets (snapshot replay)', async () => {
    const wrapper = await mountWithStores();
    const session = (wrapper.vm as unknown as { session: ReturnType<typeof useAgentSession> })
      .session;
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    session.init({ seed: 'tour-baseline-rebase-seed' });
    for (let i = 0; i < 4; i += 1) await session.tick(0.1);
    await nextTick();
    tour.skip(); // Move cursor; baseline = current tickIndex (~4).
    expect(tour.baselineTickIndex).toBeGreaterThan(0);

    // `replayFromSnapshot(null)` resets `session.tickIndex` to 0.
    await session.replayFromSnapshot(null);
    await nextTick();
    expect(session.tickIndex).toBe(0);
    expect(tour.baselineTickIndex).toBe(0);
  });

  it('clamps a restored baselineTickIndex against the current session.tickIndex on store init', async () => {
    // Simulate a hard reload mid-tour: persisted progress points at a
    // post-init step with a high baseline (15), but `session.tickIndex`
    // has just been reset to 0 by the fresh agent. Without clamping,
    // chapter 2-5 predicates compare events at tick 0 against
    // baseline=15 and stall.
    globalThis.localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        lastStep: STEP_ID_TRACE_OPEN,
        completedAt: null,
        skipped: [],
        baselineTickIndex: 15,
      }),
    );

    const wrapper = await mountWithStores();
    const session = (wrapper.vm as unknown as { session: ReturnType<typeof useAgentSession> })
      .session;
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    expect(session.tickIndex).toBe(0);
    expect(tour.baselineTickIndex).toBe(0);
  });

  it('persists the rebased baselineTickIndex so a reload picks it up', async () => {
    const wrapper = await mountWithStores();
    const session = (wrapper.vm as unknown as { session: ReturnType<typeof useAgentSession> })
      .session;
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    session.init({ seed: 'tour-baseline-persist-after-rebase-seed' });
    for (let i = 0; i < 4; i += 1) await session.tick(0.1);
    await nextTick();
    tour.skip();
    expect(tour.baselineTickIndex).toBeGreaterThan(0);

    await session.replayFromSnapshot(null);
    await nextTick();
    // The rebase MUST be persisted immediately — without persist,
    // a hard reload here would restore the pre-reset baseline.
    const raw = globalThis.localStorage.getItem(PROGRESS_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { baselineTickIndex: number };
    expect(parsed.baselineTickIndex).toBe(0);
  });

  it('persists baselineTickIndex and restores it (clamped to session.tickIndex) on remount', async () => {
    const wrapper = await mountWithStores();
    const session = (wrapper.vm as unknown as { session: ReturnType<typeof useAgentSession> })
      .session;
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    session.init({ seed: 'tour-baseline-persist-seed' });
    for (let i = 0; i < 5; i += 1) await session.tick(0.1);
    await nextTick();
    tour.start();
    const persistedBaseline = tour.baselineTickIndex;
    expect(persistedBaseline).toBe(session.tickIndex);

    const raw = globalThis.localStorage.getItem(PROGRESS_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { baselineTickIndex: number };
    expect(parsed.baselineTickIndex).toBe(persistedBaseline);

    wrapper.unmount();
    const wrapper2 = await mountWithStores();
    const tour2 = (wrapper2.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    // On remount the new session has tickIndex=0 (Pinia setup happens
    // before any session.init), so the persisted baseline (5) is
    // clamped down to keep predicates evaluable. The assertion above
    // confirms localStorage still carries the original value; the
    // clamp is an in-memory correction.
    expect(tour2.baselineTickIndex).toBe(0);
  });

  it('syncRoute pushes /tour/<step-id> when the user is already on a tour route', async () => {
    const { wrapper, router } = await mountAtPath(`/tour/${STEP_ID_AUTONOMY}`);
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    expect(tour.currentStepRoutePath).toBe(`/tour/${STEP_ID_AUTONOMY}`);
    // Skip → cursor moves to chapter-2 first step → syncRoute pushes the
    // matching URL.
    tour.skip();
    await tour.syncRoute(router);
    expect(router.currentRoute.value.path).toBe(`/tour/${STEP_ID_TRACE_OPEN}`);
  });

  it('syncRoute does NOT clobber a non-tour route the user is currently on', async () => {
    const { wrapper, router } = await mountAtPath('/play');
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    await tour.syncRoute(router);
    expect(router.currentRoute.value.path).toBe('/play');
  });

  it('syncRoute pushes /tour/<step-id> from the bare /tour route too', async () => {
    // The route is declared `/tour/:step?` so a bookmarked / manual
    // entry can land on `/tour` (no step). syncRoute must still
    // upgrade the URL to the concrete step path so deep-link
    // resume + share works.
    const { wrapper, router } = await mountAtPath('/tour');
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    expect(tour.currentStepRoutePath).toBe(`/tour/${STEP_ID_AUTONOMY}`);
    await tour.syncRoute(router);
    expect(router.currentRoute.value.path).toBe(`/tour/${STEP_ID_AUTONOMY}`);
  });

  it('resumeFromRoute fast-forwards to a downstream step id', async () => {
    const wrapper = await mountWithStores();
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    expect(tour.lastStep).toBe(STEP_ID_AUTONOMY);
    tour.resumeFromRoute(STEP_ID_COGNITION_SWAP);
    expect(tour.lastStep).toBe(STEP_ID_COGNITION_SWAP);
  });

  it('resumeFromRoute is a no-op for an unknown step id', async () => {
    const wrapper = await mountWithStores();
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    tour.resumeFromRoute('not-a-real-step');
    expect(tour.lastStep).toBe(STEP_ID_AUTONOMY);
  });

  it('complete() walks every remaining step into `skipped` and sets `completedAt`', async () => {
    const wrapper = await mountWithStores();
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    expect(tour.lastStep).toBe(STEP_ID_AUTONOMY);
    expect(tour.completedAt).toBeNull();

    tour.complete();

    // Every authored step (chapter-1 autonomy through chapter-5 import)
    // must end up in the skipped set; the last cursor stays at whatever
    // step pointed to `'end'` last.
    expect(tour.skipped).toContain(STEP_ID_AUTONOMY);
    expect(tour.skipped).toContain(STEP_ID_TRACE_OPEN);
    expect(tour.skipped).toContain(STEP_ID_REPLAY_IMPORT);
    expect(tour.completedAt).not.toBeNull();
    // Persisted in the same shot — a reload must see the completed tour.
    const raw = globalThis.localStorage.getItem(PROGRESS_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { completedAt: number | null; skipped: string[] };
    expect(parsed.completedAt).not.toBeNull();
    expect(parsed.skipped).toContain(STEP_ID_REPLAY_IMPORT);
  });

  it('complete() is a no-op once the tour is already complete', async () => {
    const wrapper = await mountWithStores();
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    tour.complete();
    const firstCompletedAt = tour.completedAt;
    expect(firstCompletedAt).not.toBeNull();
    const skippedAfterFirst = [...tour.skipped];
    tour.complete();
    expect(tour.completedAt).toBe(firstCompletedAt);
    expect([...tour.skipped]).toEqual(skippedAfterFirst);
  });

  it('Reset (replayFromSnapshot(null)) does NOT mutate tour cursor / completedAt / skipped (P1-FR-7)', async () => {
    const wrapper = await mountWithStores();
    const session = (wrapper.vm as unknown as { session: ReturnType<typeof useAgentSession> })
      .session;
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    session.init({ seed: 'tour-reset-hygiene-seed' });

    tour.skip(); // Move cursor + record skipped id.
    const stepBefore = tour.lastStep;
    const skippedBefore = [...tour.skipped];
    const completedBefore = tour.completedAt;

    await session.replayFromSnapshot(null);
    await nextTick();

    // The simulation reset, but the tour cursor / skip set / completion
    // status are independent of the agent rebuild.
    expect(tour.lastStep).toBe(stepBefore);
    expect([...tour.skipped]).toEqual(skippedBefore);
    expect(tour.completedAt).toBe(completedBefore);
  });

  it('resumeFromRoute does NOT rewind past the persisted cursor', async () => {
    const wrapper = await mountWithStores();
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    // Move forward via skip → chapter-2 first step.
    tour.skip();
    expect(tour.lastStep).toBe(STEP_ID_TRACE_OPEN);
    // Try to rewind via the URL — should be ignored.
    tour.resumeFromRoute(STEP_ID_AUTONOMY);
    expect(tour.lastStep).toBe(STEP_ID_TRACE_OPEN);
  });

  it('falls back to firstStepId when the persisted lastStep is not in the active graph', async () => {
    // Simulate a stale localStorage payload — a step id that was renamed
    // or removed in a later release. Without validation the cursor would
    // resolve to `currentStep === null` while `completedAt === null`,
    // stranding the user with no overlay and no `next()` recovery.
    globalThis.localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        lastStep: 'tour.removed-in-future-release',
        completedAt: null,
        skipped: [],
      }),
    );

    const wrapper = await mountWithStores();
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    expect(tour.lastStep).toBe(STEP_ID_AUTONOMY);
    expect(tour.completedAt).toBeNull();
    expect(tour.currentStep?.id).toBe(STEP_ID_AUTONOMY);
  });
});
