// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import TourView from '../../src/views/TourView.vue';
import { useTourProgress } from '../../src/stores/view/useTourProgress.js';
import { STEP_ID_AUTONOMY, STEP_ID_COGNITION_SWAP } from '../../src/copy/tour.js';

// vue-router's reactive `route` ref is wired through `<router-view>`;
// mounting `TourView` directly under VTU bypasses that and the
// `useRoute()` watcher inside setup never sees in-session route
// changes. Wrap with a router-view host so production-shaped
// reactivity flows through to TourView's setup.
const RouterViewHost = defineComponent({
  name: 'RouterViewHost',
  render() {
    return h(RouterView);
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
        component: TourView,
        props: true,
      },
    ],
  });
}

async function mountTourAt(path: string) {
  setActivePinia(createTestingPinia({ stubActions: false }));
  // Replace requestAnimationFrame so PlayView's tick loop is a no-op.
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const router = buildRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(RouterViewHost, { global: { plugins: [router] } });
  await flushPromises();
  await nextTick();
  return { wrapper, router };
}

describe('<TourView>', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('on mount, fast-forwards the cursor to a downstream URL step (deep-link resume)', async () => {
    // Persist a cursor at chapter-1; the URL deep-links to chapter-3.
    // Mounting must reconcile (forward-only) up to the URL step.
    const { wrapper } = await mountTourAt(`/tour/${STEP_ID_COGNITION_SWAP}`);
    const tour = useTourProgress();
    expect(tour.lastStep).toBe(STEP_ID_COGNITION_SWAP);
    wrapper.unmount();
  });

  it('on mount with an upstream URL step, leaves the cursor on the persisted progress', async () => {
    // Seed persisted progress at chapter-3.
    globalThis.localStorage.setItem(
      'demo.v2.tour.progress',
      JSON.stringify({
        lastStep: STEP_ID_COGNITION_SWAP,
        completedAt: null,
        skipped: [STEP_ID_AUTONOMY],
        baselineTickIndex: 0,
      }),
    );

    // Browser hits an upstream URL — `resumeFromRoute` is forward-only
    // so the cursor stays at the persisted downstream step.
    const { wrapper } = await mountTourAt(`/tour/${STEP_ID_AUTONOMY}`);
    const tour = useTourProgress();
    expect(tour.lastStep).toBe(STEP_ID_COGNITION_SWAP);
    wrapper.unmount();
  });
});
