/**
 * Ambient module declaration so `tsc --noEmit` accepts `*.vue` imports
 * from the routes / app shell. Vue SFCs themselves are processed by
 * `@vitejs/plugin-vue` at build time and `vue-tsc` once it is wired in
 * a later pillar slice; this shim just keeps the TypeScript-only check
 * (run from the repo root) green while the SFCs stay opaque to `tsc`.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
