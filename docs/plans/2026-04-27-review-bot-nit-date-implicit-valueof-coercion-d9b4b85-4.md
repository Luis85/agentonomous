---
date: 2026-04-27
slug: review-bot-nit-date-implicit-valueof-coercion-d9b4b85-4
finding-id: d9b4b85.4
tracker: '#155'
severity: NIT
---

# Fix review finding `d9b4b85.4` — `new Date(b.issue.createdAt) - new Date(a.issue.createdAt)` relies on implicit `Date.valueOf()` coercion

## Source

From `#155` (https://github.com/Luis85/agentonomous/issues/155), finding `d9b4b85.4`:

> **[NIT]** `scripts/review-fix-parse.mjs:105` — `new Date(b.issue.createdAt) - new Date(a.issue.createdAt)` relies on implicit `Date.valueOf()` coercion
>
> <details><summary>details</summary>
>
> **Problem:** Arithmetic between two `Date` objects coerces via `valueOf()` implicitly.
>
> **Why it matters:** TypeScript strict mode would flag this as `error TS2362/2363`; if this file is ever migrated to `.ts` or a TypeScript-strict linter is applied to `.mjs` files, the implicit coercion becomes a build error.
>
> **Fix:**
>
> ```diff
> -  .sort((a, b) => new Date(b.issue.createdAt) - new Date(a.issue.createdAt));
> +  .sort((a, b) => new Date(b.issue.createdAt).getTime() - new Date(a.issue.createdAt).getTime());
> ```
>
> </details>

## Acceptance

- Apply the bot's proposed fix (see body above).
- Add or update tests covering the new code paths.
- `npm run verify` passes locally.
- Codex review on the PR is acknowledged or rebutted on each thread.

## Rollout

- Branch: `fix/review-bot-nit-date-implicit-valueof-coercion-d9b4b85-4` (already cut by review-fix skill).
- PR base: `develop`.
- PR body MUST contain on its own line: `Refs #155 finding:d9b4b85.4`.
- PR body MUST NOT contain `Closes #155` / `Fixes #155`.
- Changeset required if behavior changes (`npm run changeset`).
