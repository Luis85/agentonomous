// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import SpeedPicker from '../../src/components/shell/SpeedPicker.vue';
import { useAgentSession } from '../../src/stores/domain/useAgentSession.js';
import { BASE_TIME_SCALE } from '../../src/demo-domain/scenarios/petCare/buildAgent.js';

const SPEED_KEY = 'demo.v2.session.speed';

describe('<SpeedPicker>', () => {
  beforeEach(() => {
    setActivePinia(createTestingPinia({ stubActions: false }));
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it('renders six speed choices and defaults the active button to 1×', async () => {
    const session = useAgentSession();
    session.init({ seed: 'speed-render-seed' });
    const wrapper = mount(SpeedPicker);
    await nextTick();
    const buttons = wrapper.findAll('button');
    expect(buttons.length).toBe(6);
    const active = wrapper.findAll('button.active');
    expect(active.length).toBe(1);
    expect(active[0]?.text()).toContain('1×');
  });

  it('clicking a speed button calls setSpeed and writes demo.v2.session.speed', async () => {
    const session = useAgentSession();
    session.init({ seed: 'speed-click-seed' });
    const wrapper = mount(SpeedPicker);
    await nextTick();
    const buttons = wrapper.findAll('button');
    // Choices: [pause, 0.5×, 1×, 2×, 4×, 8×]
    await buttons[4]?.trigger('click');
    expect(session.speedMultiplier).toBe(4);
    expect(session.agent?.getTimeScale()).toBe(BASE_TIME_SCALE * 4);
    expect(globalThis.localStorage.getItem(SPEED_KEY)).toBe('4');
  });

  it('clicking pause calls session.pause() and stores "pause"', async () => {
    const session = useAgentSession();
    session.init({ seed: 'speed-pause-seed' });
    const wrapper = mount(SpeedPicker);
    await nextTick();
    const buttons = wrapper.findAll('button');
    await buttons[0]?.trigger('click');
    expect(session.running).toBe(false);
    expect(session.agent?.getTimeScale()).toBe(0);
    expect(globalThis.localStorage.getItem(SPEED_KEY)).toBe('pause');
  });

  it('does not migrate the legacy agentonomous/speed key (pre-v1 clean break)', async () => {
    globalThis.localStorage.setItem('agentonomous/speed', '8');
    const session = useAgentSession();
    session.init({ seed: 'speed-no-migrate-seed' });
    const wrapper = mount(SpeedPicker);
    await nextTick();
    expect(session.speedMultiplier).toBe(1);
    expect(globalThis.localStorage.getItem(SPEED_KEY)).toBeNull();
    wrapper.unmount();
  });

  it('survives a session reset without drifting from the store (preserve-speed contract)', async () => {
    // Codex P2 #3 — picker's `active` must not desync from the store
    // when `replayFromSnapshot(null)` runs (Reset button). The fix
    // lives store-side: `useAgentSession.replayFromSnapshot` now
    // preserves `speedMultiplier` + `running`, so a mount-time-
    // initialized local ref stays correct across reset. The full
    // store-contract regression coverage is in
    // `useAgentSession.test.ts > replayFromSnapshot(null) preserves
    // the user-chosen speedMultiplier across rebuild`.
    const session = useAgentSession();
    session.init({ seed: 'speed-survives-reset-seed' });
    const wrapper = mount(SpeedPicker);
    await nextTick();
    const buttons = wrapper.findAll('button');
    await buttons[4]?.trigger('click'); // pick 4×
    expect(session.speedMultiplier).toBe(4);

    await session.replayFromSnapshot(null);

    expect(session.speedMultiplier).toBe(4);
    expect(session.agent?.getTimeScale()).toBe(BASE_TIME_SCALE * 4);
    wrapper.unmount();
  });
});
