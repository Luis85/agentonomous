// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { setActivePinia } from 'pinia';
import { createTestingPinia } from '@pinia/testing';
import { useSelectorRegistry } from '../../../src/stores/view/useSelectorRegistry.js';
import {
  REGISTERED_HANDLES,
  isRegisteredHandle,
  registeredHandle,
} from '../../../src/stores/view/selectorHandles.js';

function withPinia(): void {
  setActivePinia(createTestingPinia({ stubActions: false }));
}

describe('selectorHandles registry', () => {
  it('round-trips a registered handle through register / resolve / unregister', () => {
    withPinia();
    const registry = useSelectorRegistry();
    const el = document.createElement('div');

    // `resolve` is null before registration.
    expect(registry.resolve('hud.needs')).toBeNull();

    registry.register('hud.needs', el);
    expect(registry.resolve('hud.needs')).toBe(el);

    registry.unregister('hud.needs');
    expect(registry.resolve('hud.needs')).toBeNull();
  });

  it('keeps independent slots per handle', () => {
    withPinia();
    const registry = useSelectorRegistry();
    const a = document.createElement('div');
    const b = document.createElement('div');

    registry.register('hud.needs', a);
    registry.register('trace.panel', b);

    expect(registry.resolve('hud.needs')).toBe(a);
    expect(registry.resolve('trace.panel')).toBe(b);

    registry.unregister('hud.needs');
    expect(registry.resolve('hud.needs')).toBeNull();
    // Unrelated handle survives.
    expect(registry.resolve('trace.panel')).toBe(b);
  });

  it('rejects unknown literals at compile time', () => {
    withPinia();
    const registry = useSelectorRegistry();
    const el = document.createElement('div');

    // @ts-expect-error - 'not.registered' is not a member of RegisteredHandle.
    registry.register('not.registered', el);
    // @ts-expect-error - registeredHandle() also rejects unknown literals.
    registeredHandle('not.registered');
  });

  it('exposes a runtime membership probe consistent with the union', () => {
    expect(isRegisteredHandle('hud.needs')).toBe(true);
    expect(isRegisteredHandle('not.registered')).toBe(false);
    for (const handle of REGISTERED_HANDLES) {
      expect(isRegisteredHandle(handle)).toBe(true);
    }
  });
});
