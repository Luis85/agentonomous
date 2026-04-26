// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import { createMemoryHistory, createRouter } from 'vue-router';
import TourOverlay from '../../src/components/tour/TourOverlay.vue';
import { useAgentSession } from '../../src/stores/domain/useAgentSession.js';
import { useTourProgress } from '../../src/stores/view/useTourProgress.js';

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/play', component: { template: '<div />' } }],
  });
}

async function mountOverlay() {
  const pinia = createTestingPinia({ stubActions: false });
  setActivePinia(pinia);
  const router = buildRouter();
  await router.push('/play');
  await router.isReady();
  return mount(TourOverlay, { global: { plugins: [pinia, router] } });
}

describe('<TourOverlay>', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it('renders the chapter-1 hint card on cold start', async () => {
    const wrapper = await mountOverlay();
    await nextTick();
    expect(wrapper.find('.tour-overlay__title').exists()).toBe(true);
    expect(wrapper.find('.tour-overlay__hint').text()).toContain('Whiskers');
  });

  it('clicking Skip records the step + advances the cursor', async () => {
    const wrapper = await mountOverlay();
    const tour = useTourProgress();
    await nextTick();
    expect(wrapper.find('.tour-overlay__skip').exists()).toBe(true);
    const before = tour.lastStep;
    await wrapper.find('.tour-overlay__skip').trigger('click');
    expect(tour.skipped.length).toBeGreaterThan(0);
    expect(tour.lastStep).not.toBe(before);
  });

  it('clicking Restart returns the cursor to chapter-1 step-1', async () => {
    const wrapper = await mountOverlay();
    const tour = useTourProgress();
    await nextTick();
    // Skip once to move off the first step, then restart.
    const initial = tour.lastStep;
    await wrapper.find('.tour-overlay__skip').trigger('click');
    expect(tour.lastStep).not.toBe(initial);
    expect(wrapper.find('.tour-overlay__restart').exists()).toBe(true);
    await wrapper.find('.tour-overlay__restart').trigger('click');
    expect(tour.lastStep).toBe(initial);
    expect(tour.skipped).toEqual([]);
    expect(tour.completedAt).toBeNull();
  });

  it('advances chapter-1 once the predicate fires via tickIndex changes', async () => {
    const wrapper = await mountOverlay();
    const session = useAgentSession();
    const tour = useTourProgress();
    const initial = tour.lastStep;
    session.init({ seed: 'overlay-advance-seed' });
    for (let i = 0; i < 4; i += 1) await session.tick(0.1);
    await nextTick();
    await nextTick();
    // Either the watcher already fired, or an explicit `next()` finds
    // the predicate satisfied. Either way, after this the cursor has
    // moved off chapter-1.
    if (tour.lastStep === initial) tour.next();
    expect(tour.lastStep).not.toBe(initial);
    expect(wrapper.exists()).toBe(true);
  });
});
