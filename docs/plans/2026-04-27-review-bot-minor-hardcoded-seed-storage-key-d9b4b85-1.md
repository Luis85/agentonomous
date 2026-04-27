---
date: 2026-04-27
slug: review-bot-minor-hardcoded-seed-storage-key-d9b4b85-1
finding-id: d9b4b85.1
tracker: '#155'
severity: MINOR
---

# Fix review finding `d9b4b85.1` — hardcoded seed storage key duplicates store's computed key, silent drift risk

## Source

From `#155` (https://github.com/Luis85/agentonomous/issues/155), finding `d9b4b85.1`:

> **[MINOR]** `examples/product-demo/src/views/PlayView.vue:11` — hardcoded seed storage key duplicates store's computed key, silent drift risk
>
> <details><summary>details</summary>
>
> **Problem:** `SEED_PERSIST_KEY = 'demo.v2.session.lastSeed.petCare'` in `PlayView.vue` hardcodes the same string that `useAgentSession.ts` constructs dynamically as `` `${SEED_STORAGE_KEY_PREFIX}${scenarioId}` `` (`'demo.v2.session.lastSeed.' + 'petCare'`).
>
> **Why it matters:** If `SEED_STORAGE_KEY_PREFIX` or `DEFAULT_SCENARIO_ID` ever changes in the store, `PlayView.vue`'s read silently misses the new key, generating a fresh seed on every load and losing session continuity for returning users without any compile-time or test-time signal.
>
> **Fix:**
>
> ```diff
> // examples/product-demo/src/views/PlayView.vue
> -const SEED_PERSIST_KEY = 'demo.v2.session.lastSeed.petCare';
> -
> -function readPersistedSeed(): string | null {
> -  try {
> -    const raw = globalThis.localStorage?.getItem(SEED_PERSIST_KEY);
> -    return typeof raw === 'string' && raw.length > 0 ? raw : null;
> -  } catch { return null; }
> -}
> ```
>
> Export `readPersistedSeed(scenarioId)` from `useAgentSession.ts` and call it in `PlayView.vue`, or expose the storage key constant so both sides stay in sync.
>
> </details>

## Acceptance

- Apply the bot's proposed fix (see body above).
- Add or update tests covering the new code paths.
- `npm run verify` passes locally.
- Codex review on the PR is acknowledged or rebutted on each thread.

## Rollout

- Branch: `fix/review-bot-minor-hardcoded-seed-storage-key-d9b4b85-1` (already cut by review-fix skill).
- PR base: `develop`.
- PR body MUST contain on its own line: `Refs #155 finding:d9b4b85.1`.
- PR body MUST NOT contain `Closes #155` / `Fixes #155`.
- Changeset required if behavior changes (`npm run changeset`).
