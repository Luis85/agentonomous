import { getCurrentInstance, onBeforeUnmount, onMounted } from 'vue';
import { useSelectorRegistry } from '../stores/view/useSelectorRegistry.js';
import type { RegisteredHandle } from '../stores/view/selectorHandles.js';

/**
 * Component-side glue that registers a `RegisteredHandle` with the
 * `useSelectorRegistry` Pinia store on mount and removes it on unmount.
 *
 * Why not `useTemplateRef` / a `:ref` callback?
 * `@vitejs/plugin-vue`'s production transform hoists `<script setup>`
 * template-ref bindings to module scope, which makes Vue Test Utils'
 * inner-component vnodes look "external" and trips the
 * runtime-template-ref binding warning. Slice 1.2b's `<HudPanel>`
 * worked around it by reading `instance.proxy.$el.querySelector(...)`
 * after mount; this composable bottles that pattern so chapters 2-5
 * don't each re-derive it.
 *
 * Contract:
 *   - The component MUST decorate the highlight host with
 *     `data-tour-handle="<the same handle>"`. The composable looks up
 *     the host via `instance.proxy.$el.querySelector(...)` after mount;
 *     a missing data attribute leaves the registry slot empty and the
 *     overlay degrades to a label-only render (no crash).
 *   - The handle parameter is typed as `RegisteredHandle`, so a typo
 *     fails `tsc` rather than silently dropping the registration.
 */
export function useRegisterSelector(handle: RegisteredHandle): void {
  const registry = useSelectorRegistry();
  const instance = getCurrentInstance();

  onMounted(() => {
    const root = instance?.proxy?.$el as HTMLElement | undefined;
    if (root === undefined) return;
    // `querySelector` searches descendants only, so a root element that
    // *is* the highlight host (single-root SFC carrying the handle on
    // its outermost div) would silently fail to register. Check the
    // root first, then fall back to a descendant lookup.
    const selfMatch =
      typeof root.matches === 'function' && root.matches(`[data-tour-handle="${handle}"]`);
    const host = selfMatch
      ? root
      : (root.querySelector?.<HTMLElement>(`[data-tour-handle="${handle}"]`) ?? null);
    if (host !== null) registry.register(handle, host);
  });

  onBeforeUnmount(() => {
    registry.unregister(handle);
  });
}
