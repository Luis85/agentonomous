/**
 * Product-demo Vue bootstrap (Pillar 1, slice 1.2b — bridge swap).
 *
 * Replaces the Wave-0 `await import('../main.js')` shim. This module is
 * the live entry: it purges legacy localStorage keys (spec STO-3),
 * spins up Pinia + the demo router, and mounts `<App />` into
 * `index.html`'s `#app` slot.
 *
 * The legacy vanilla-TS DOM-mount files (`src/{ui,traceView,seed,main}.ts`)
 * are deleted in this slice — their logic now lives in the Vue SFCs and
 * Pinia stores under `app/`, `components/`, `views/`, `stores/`.
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { createAppRouter } from '../routes/index.js';

const LEGACY_KEY_PREFIXES = ['nurture-pet.', 'demo.'] as const;
// `demo.v2.*` is the new namespace the pillar PRs write into; leave it
// alone. Anything else under `demo.*` is the un-prefixed legacy shape
// the spec instructs us to purge — likewise the legacy `agentonomous/*`
// + `whiskers*` keys the vanilla-TS demo wrote pre-rename.
const PURGE_NAMESPACE_GUARD = 'demo.v2.';
const LEGACY_EXACT_KEYS: ReadonlyArray<string> = [
  'agentonomous/seed',
  'agentonomous/speed',
  'agentonomous/trace-visible',
  'agentonomous/species-config',
  'whiskers',
  'whiskers:speed',
];

function purgeLegacyDemoKeys(): readonly string[] {
  const purged: string[] = [];

  // Reading `globalThis.localStorage` itself can throw `SecurityError` in
  // privacy-restricted browsers and sandboxed iframes — guard the access
  // inside the try so the bootstrap never crashes before mount.
  try {
    const storage = globalThis.localStorage;
    if (!storage) return purged;

    const matches: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key === null) continue;
      if (key.startsWith(PURGE_NAMESPACE_GUARD)) continue;
      if (LEGACY_EXACT_KEYS.includes(key)) {
        matches.push(key);
        continue;
      }
      // The `agentonomous/*` namespace also held per-pet snapshots
      // (`agentonomous/<id>` + `agentonomous/<id>/tfjs-network` +
      // `agentonomous/__agentonomous/index__`). Pre-v1 clean break:
      // wipe the whole namespace; the new shell rebuilds via the
      // `demo.v2.*` keys on first mount.
      if (key.startsWith('agentonomous/')) {
        matches.push(key);
        continue;
      }
      for (const prefix of LEGACY_KEY_PREFIXES) {
        if (key.startsWith(prefix)) {
          matches.push(key);
          break;
        }
      }
    }
    for (const key of matches) {
      storage.removeItem(key);
      purged.push(key);
    }
  } catch {
    // localStorage unavailable or access blocked (private mode, quota,
    // SecurityError in sandboxed iframes) — treat as no-op.
  }
  return purged;
}

const purged = purgeLegacyDemoKeys();
// Dev-only one-line notice so a developer sees the cleanup happen without
// spamming production builds. `import.meta.env.DEV` is set by Vite at
// build time (not in the demo's tsconfig types — typed inline to avoid
// pulling in `vite/client` ambient types).
const meta = import.meta as unknown as { env?: { DEV?: boolean; BASE_URL?: string } };
if (purged.length > 0 && meta.env?.DEV === true) {
  console.warn(
    `[product-demo] Purged ${String(purged.length)} legacy localStorage key(s): ${purged.join(', ')} (spec STO-3).`,
  );
}

const app = createApp(App);
app.use(createPinia());
app.use(createAppRouter(meta.env?.BASE_URL ?? '/'));
app.mount('#app');
