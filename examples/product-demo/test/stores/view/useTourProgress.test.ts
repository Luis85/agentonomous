// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAgentSession } from '../../../src/stores/domain/useAgentSession.js';
import { useTourProgress } from '../../../src/stores/view/useTourProgress.js';
import { STEP_ID_AUTONOMY } from '../../../src/copy/tour.js';

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

  it('next() advances to TOUR_END once the agent has ticked enough times', async () => {
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
    expect(tour.completedAt).not.toBeNull();
    // Cursor for the completed tour is null — the overlay reads
    // `currentStep` and renders nothing past completion.
    expect(tour.currentStep).toBeNull();
  });

  it('skip() records the step + advances regardless of predicate', async () => {
    const wrapper = await mountWithStores();
    const tour = (wrapper.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    tour.skip();
    expect(tour.skipped).toContain(STEP_ID_AUTONOMY);
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
    expect(parsed.completedAt).not.toBeNull();

    // Re-mount: a fresh store reads the persisted record.
    wrapper.unmount();
    const wrapper2 = await mountWithStores();
    const tour2 = (wrapper2.vm as unknown as { tour: ReturnType<typeof useTourProgress> }).tour;
    expect(tour2.completedAt).not.toBeNull();
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
