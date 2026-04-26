/**
 * Product-demo bootstrap entry. Wave-0 (rename preflight) introduces this
 * file as the demo's `app/` entry point per the design's folder layout.
 * Future pillar PRs migrate the rest of `src/main.ts` into the layered
 * `app/` + `routes/` + `views/` + `stores/` + `demo-domain/` tree.
 *
 * Responsibilities for the rename slice:
 *
 * 1. Purge legacy `nurture-pet.*` and un-prefixed `demo.*` localStorage
 *    keys on first load (spec STO-3). Pre-v1 policy explicitly drops
 *    back-compat with old key shapes; the purge frees those slots so the
 *    `demo.v2.*` key namespace introduced by the pillar PRs is the only
 *    surface in DevTools.
 * 2. Hand off to the existing `src/main.ts` module so the current
 *    nurture-pet baseline keeps booting end-to-end. The pillar refactor
 *    will rewrite that module into Vue + Pinia + Router; until then the
 *    side-effect import is the contract.
 */

const LEGACY_KEY_PREFIXES = ['nurture-pet.', 'demo.'] as const;
// `demo.v2.*` is the new namespace the pillar PRs write into; leave it
// alone. Anything else under `demo.*` is the un-prefixed legacy shape
// the spec instructs us to purge.
const PURGE_NAMESPACE_GUARD = 'demo.v2.';

function purgeLegacyDemoKeys(): readonly string[] {
  const purged: string[] = [];
  const storage = globalThis.localStorage;
  if (!storage) return purged;

  try {
    const matches: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key === null) continue;
      if (key.startsWith(PURGE_NAMESPACE_GUARD)) continue;
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
    // localStorage unavailable (private mode, quota) — treat as no-op.
  }
  return purged;
}

const purged = purgeLegacyDemoKeys();
// Dev-only one-line notice so a developer sees the cleanup happen without
// spamming production builds. `import.meta.env.DEV` is set by Vite at
// build time (not in the demo's tsconfig types — typed inline to avoid
// pulling in `vite/client` ambient types).
const meta = import.meta as unknown as { env?: { DEV?: boolean } };
if (purged.length > 0 && meta.env?.DEV === true) {
  console.warn(
    `[product-demo] Purged ${String(purged.length)} legacy localStorage key(s): ${purged.join(', ')} (spec STO-3).`,
  );
}

// Side-effect import: triggers the existing nurture-pet baseline boot.
await import('../main.js');
