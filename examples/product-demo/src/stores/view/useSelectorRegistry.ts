import { defineStore } from 'pinia';
import { markRaw, ref } from 'vue';
import type { RegisteredHandle } from './selectorHandles.js';

/**
 * Per-component DOM-handle registry consumed by `<StepHighlight>` and
 * the broader tour overlay (Pillar 1, slices 1.2b → 1.3).
 *
 * Components that own a tour highlight target call `register(handle, el)`
 * on mount and `unregister(handle)` on unmount. The overlay reads the
 * current step's `highlight` and resolves it via `resolve(handle)` —
 * a missing handle returns `null` and the overlay degrades to a
 * label-only render.
 *
 * Slice 1.3 closed the handle union: `register` / `unregister` /
 * `resolve` all accept `RegisteredHandle`, so the only way to hit
 * `null` at runtime is a missed mount call (e.g. v-if hiding the host),
 * never a typo. A renamed handle in `selectorHandles.ts` propagates as
 * a `tsc` error to every chapter and component that referenced it
 * (spec P1-FR-4).
 */
export const useSelectorRegistry = defineStore('selectorRegistry', () => {
  // `markRaw` keeps Pinia's reactivity proxy from traversing the DOM
  // node identities. Highlights re-mount frequently (every chapter) and
  // the registry's read path only needs identity equality.
  const handles = markRaw(new Map<RegisteredHandle, HTMLElement>());
  // Reactive bump so consumers using `resolve` inside a `computed` /
  // `watch` re-run when the underlying map mutates.
  const version = ref(0);

  function register(handle: RegisteredHandle, el: HTMLElement): void {
    handles.set(handle, el);
    version.value += 1;
  }

  function unregister(handle: RegisteredHandle): void {
    if (handles.delete(handle)) version.value += 1;
  }

  function resolve(handle: RegisteredHandle): HTMLElement | null {
    // Reading `version` ties the reactivity dependency without exposing
    // the raw map — callers stay correct under v-if remounts.
    void version.value;
    return handles.get(handle) ?? null;
  }

  return { register, unregister, resolve };
});
