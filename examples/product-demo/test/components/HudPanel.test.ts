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
});
