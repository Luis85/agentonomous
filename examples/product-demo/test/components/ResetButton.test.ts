// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import ResetButton from '../../src/components/shell/ResetButton.vue';
import { useAgentSession } from '../../src/stores/domain/useAgentSession.js';

describe('<ResetButton>', () => {
  beforeEach(() => {
    setActivePinia(createTestingPinia({ stubActions: false }));
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('confirms before resetting and rebuilds the agent on accept', async () => {
    const session = useAgentSession();
    session.init({ seed: 'reset-accept-seed' });
    const firstAgent = session.agent;
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const wrapper = mount(ResetButton);
    await nextTick();
    await wrapper.find('button').trigger('click');
    await nextTick();
    expect(session.agent).not.toBe(firstAgent);
  });

  it('cancelling the confirm leaves the agent untouched', async () => {
    const session = useAgentSession();
    session.init({ seed: 'reset-cancel-seed' });
    const firstAgent = session.agent;
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    const wrapper = mount(ResetButton);
    await nextTick();
    await wrapper.find('button').trigger('click');
    await nextTick();
    expect(session.agent).toBe(firstAgent);
  });
});
