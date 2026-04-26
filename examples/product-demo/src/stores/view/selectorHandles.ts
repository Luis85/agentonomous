/**
 * Closed registry of tour-highlight handles known to the demo.
 *
 * The `<TourOverlay>` resolves a step's `highlight` field through the
 * `useSelectorRegistry` Pinia store. Slice 1.2b shipped the registry as
 * a stub keyed on the open `SelectorHandle` brand — any literal would
 * type-check, so a renamed component-side handle silently fell back to
 * a label-only render. Slice 1.3 (this file) closes the union: chapter
 * authors and component authors both pull `RegisteredHandle` from here,
 * so a missing literal is a `tsc` error (spec P1-FR-4).
 *
 * Adding a handle is a one-line edit to `REGISTERED_HANDLES` plus a
 * `useRegisterSelector(...)` call in the component that owns the DOM
 * node. Removing a handle is also a `tsc`-driven sweep — every chapter
 * step that referenced it surfaces immediately.
 */

import type { SelectorHandle } from '../../demo-domain/walkthrough/types.js';

/**
 * Every handle the tour is allowed to highlight. The tuple is exported
 * `as const` so consumers can iterate it at runtime (e.g. tests that
 * snapshot the registered set) without losing the literal-string union.
 */
export const REGISTERED_HANDLES = [
  'hud.needs',
  'hud.cognition.toggle',
  'hud.cognition.indicator',
  'hud.json.toggle',
  'trace.panel',
  'export.button',
  'import.button',
] as const;

/** Closed union of every handle registered by a demo component. */
export type RegisteredHandle = (typeof REGISTERED_HANDLES)[number];

/**
 * Construct a `SelectorHandle` from a known-registered literal. The
 * parameter type forces the caller to pass a member of `RegisteredHandle`,
 * so a typo / renamed handle fails compile at the call site.
 */
export function registeredHandle(handle: RegisteredHandle): SelectorHandle {
  // The brand cast lives here rather than in `demo-domain/walkthrough/types`
  // so this view-layer file doesn't take a runtime import on the domain
  // module (lint:demo's `no-restricted-imports` keeps view → domain
  // runtime traffic out, allowing `import type` only).
  return handle as unknown as SelectorHandle;
}

/**
 * Runtime-checkable membership probe. Useful for the registry's debug
 * surface and tests; production code should rely on the type union.
 */
export function isRegisteredHandle(value: string): value is RegisteredHandle {
  return (REGISTERED_HANDLES as readonly string[]).includes(value);
}
