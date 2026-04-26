// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import { useRegisterSelector } from '../../src/composables/useRegisterSelector.js';
import { useSelectorRegistry } from '../../src/stores/view/useSelectorRegistry.js';

const RegisterProbe = defineComponent({
  name: 'RegisterProbe',
  setup() {
    useRegisterSelector('hud.needs');
  },
  render() {
    return h('div', { 'data-tour-handle': 'hud.needs', id: 'probe-host' }, 'probe');
  },
});

const RegisterProbeWithoutHost = defineComponent({
  name: 'RegisterProbeWithoutHost',
  setup() {
    useRegisterSelector('trace.panel');
  },
  render() {
    // Intentionally no `data-tour-handle` — composable should silently
    // skip the registration so the overlay degrades to label-only.
    return h('div', null, 'no-host');
  },
});

describe('useRegisterSelector', () => {
  it('registers the host element on mount and removes it on unmount', () => {
    setActivePinia(createTestingPinia({ stubActions: false }));
    const wrapper = mount(RegisterProbe);
    const registry = useSelectorRegistry();

    const el = registry.resolve('hud.needs');
    expect(el).not.toBeNull();
    expect(el?.id).toBe('probe-host');

    wrapper.unmount();
    expect(registry.resolve('hud.needs')).toBeNull();
  });

  it('leaves the registry slot empty when the data-attr host is missing', () => {
    setActivePinia(createTestingPinia({ stubActions: false }));
    const wrapper = mount(RegisterProbeWithoutHost);
    const registry = useSelectorRegistry();

    expect(registry.resolve('trace.panel')).toBeNull();
    wrapper.unmount();
    expect(registry.resolve('trace.panel')).toBeNull();
  });
});
