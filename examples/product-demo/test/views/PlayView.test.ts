// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import PlayView from '../../src/views/PlayView.vue';
import { useAgentSession } from '../../src/stores/domain/useAgentSession.js';
import { BASE_TIME_SCALE } from '../../src/demo-domain/scenarios/petCare/buildAgent.js';

const SPEED_KEY = 'demo.v2.session.speed';

describe('<PlayView>', () => {
  beforeEach(() => {
    setActivePinia(createTestingPinia({ stubActions: false }));
    globalThis.localStorage.clear();
    // Replace requestAnimationFrame with a no-op so the tick loop never
    // advances during the test (we are asserting on initial-mount state).
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    globalThis.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('honours a persisted "pause" speed: parent init runs before SpeedPicker.onMounted', async () => {
    globalThis.localStorage.setItem(SPEED_KEY, 'pause');
    const session = useAgentSession();
    const wrapper = mount(PlayView);
    await nextTick();
    expect(session.running).toBe(false);
    expect(session.agent?.getTimeScale()).toBe(0);
    wrapper.unmount();
  });

  it('honours a persisted numeric speed', async () => {
    globalThis.localStorage.setItem(SPEED_KEY, '4');
    const session = useAgentSession();
    const wrapper = mount(PlayView);
    await nextTick();
    expect(session.speedMultiplier).toBe(4);
    expect(session.agent?.getTimeScale()).toBe(BASE_TIME_SCALE * 4);
    expect(session.running).toBe(true);
    wrapper.unmount();
  });

  it('with no persisted speed defaults to 1× running', async () => {
    const session = useAgentSession();
    const wrapper = mount(PlayView);
    await nextTick();
    expect(session.speedMultiplier).toBe(1);
    expect(session.running).toBe(true);
    wrapper.unmount();
  });

  // Reads the same `demo.v2.session.lastSeed.<scenarioId>` key the store
  // writes via `useAgentSession.init`. Tripwire for review-bot finding
  // d9b4b85.1: if PlayView ever drifts back to a hardcoded key, the
  // persisted seed silently misses and a fresh seed is generated on
  // every mount.
  it('reuses the seed persisted under the store-owned key', async () => {
    globalThis.localStorage.setItem('demo.v2.session.lastSeed.petCare', 'persisted-seed-x');
    const session = useAgentSession();
    const wrapper = mount(PlayView);
    await nextTick();
    expect(session.seed).toBe('persisted-seed-x');
    wrapper.unmount();
  });
});
