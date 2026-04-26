// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import HudPanel from '../../src/components/shell/HudPanel.vue';
import { useAgentSession } from '../../src/stores/domain/useAgentSession.js';

describe('<HudPanel>', () => {
  beforeEach(() => {
    setActivePinia(createTestingPinia({ stubActions: false }));
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it('renders one bar per declared need + the seven interaction buttons', async () => {
    const session = useAgentSession();
    session.init({ seed: 'hud-render-seed' });
    const wrapper = mount(HudPanel);
    await nextTick();
    const bars = wrapper.findAll('.bar');
    expect(bars.length).toBe(5);
    const buttons = wrapper.findAll('.buttons button');
    expect(buttons.length).toBe(7);
  });

  it('clicking an interaction button calls agent.interact(verb)', async () => {
    const session = useAgentSession();
    session.init({ seed: 'hud-interact-seed' });
    const wrapper = mount(HudPanel);
    await nextTick();
    const agent = session.agent;
    if (agent === null) throw new Error('agent did not initialise');
    let invokedVerb: string | null = null;
    const originalInteract = agent.interact.bind(agent);
    agent.interact = ((verb: string) => {
      invokedVerb = verb;
      return originalInteract(verb);
    }) as typeof agent.interact;
    const feedBtn = wrapper.findAll('.buttons button')[0];
    await feedBtn?.trigger('click');
    expect(invokedVerb).toBe('feed');
  });

  it('registers the hud.needs selector handle on mount and unregisters on unmount', async () => {
    const session = useAgentSession();
    session.init({ seed: 'hud-handle-seed' });
    const { useSelectorRegistry } = await import('../../src/stores/view/useSelectorRegistry.js');
    const registry = useSelectorRegistry();
    const wrapper = mount(HudPanel, { attachTo: document.body });
    await nextTick();
    const handle = 'hud.needs' as unknown as Parameters<typeof registry.resolve>[0];
    expect(wrapper.find('.bars').exists()).toBe(true);
    expect(registry.resolve(handle)).not.toBeNull();
    wrapper.unmount();
    expect(registry.resolve(handle)).toBeNull();
  });

  it('clears HUD lifetime counters when the session swaps in a fresh agent', async () => {
    const session = useAgentSession();
    session.init({ seed: 'hud-reset-seed' });
    const wrapper = mount(HudPanel);
    await nextTick();

    // Reach into <script setup> state to seed non-zero lifetime counters
    // and a stale life-summary banner — the same shape `tally()` /
    // `AgentDied` would produce. The watcher under test must reset both
    // when ResetButton's `replayFromSnapshot(null)` swaps the agent ref.
    // Vue's setupState proxy auto-unwraps refs on read AND auto-routes
    // writes back into `.value`, so plain property assignment is
    // sufficient; trying `setupState[k].value = ...` blows up because
    // the read has already been unwrapped by the proxy.
    const setupState = (wrapper.vm.$ as unknown as { setupState: Record<string, unknown> })
      .setupState;
    setupState['counters'] = { ateCount: 5, scoldedCount: 2, illnessCount: 1, petCount: 3 };
    setupState['lifeSummary'] = { name: 'old-pet', diedAtMs: 0 };

    await session.replayFromSnapshot(null);
    await nextTick();

    expect(setupState['counters']).toEqual({
      ateCount: 0,
      scoldedCount: 0,
      illnessCount: 0,
      petCount: 0,
    });
    expect(setupState['lifeSummary']).toBeNull();
  });
});
