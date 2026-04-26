import { defineStore } from 'pinia';
import { markRaw, ref } from 'vue';
import type { SelectorHandle } from '../../demo-domain/walkthrough/types.js';

/**
 * Per-component DOM-handle registry consumed by `<StepHighlight>` and
 * the broader tour overlay (Pillar 1, slice 1.2b — stub).
 *
 * Components that own a tour highlight target call `register(handle, el)`
 * on mount and `unregister(handle)` on unmount. The overlay reads the
 * current step's `highlight` and resolves it via `resolve(handle)` —
 * a missing handle returns `null` and the overlay degrades to a
 * label-only render.
 *
 * Spec P1-FR-4 promises that a missing registered handle surfaces as a
 * `tsc` error rather than a runtime crash. The full compile-time
 * enforcement (typed handle table per component) lands in slice 1.3;
 * this slice ships the registry contract + a single-handle wiring
 * (`hud.needs`) so the chapter-1 overlay has a real element to outline.
 */
export const useSelectorRegistry = defineStore('selectorRegistry', () => {
  // `markRaw` keeps Pinia's reactivity proxy from traversing the DOM
  // node identities. Highlights re-mount frequently (every chapter) and
  // the registry's read path only needs identity equality.
  const handles = markRaw(new Map<SelectorHandle, HTMLElement>());
  // Reactive bump so consumers using `resolve` inside a `computed` /
  // `watch` re-run when the underlying map mutates.
  const version = ref(0);

  function register(handle: SelectorHandle, el: HTMLElement): void {
    handles.set(handle, el);
    version.value += 1;
  }

  function unregister(handle: SelectorHandle): void {
    if (handles.delete(handle)) version.value += 1;
  }

  function resolve(handle: SelectorHandle): HTMLElement | null {
    // Reading `version` ties the reactivity dependency without exposing
    // the raw map — callers stay correct under v-if remounts.
    void version.value;
    return handles.get(handle) ?? null;
  }

  return { register, unregister, resolve };
});
