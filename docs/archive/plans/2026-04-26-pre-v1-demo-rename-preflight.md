> **Archived 2026-04-26.** Completed in the Wave-0 demo rename preflight PR; tracked under the umbrella issue [#132](https://github.com/Luis85/agentonomous/issues/132). The rename + script + workflow + ESLint rules + Playwright skeleton + doc sweep + legacy-key purge all shipped in that single atomic PR. Body left intact as the historical record.

# Demo rename preflight — pre-v1 demo evolution

Plan date: 2026-04-26
Wave: 0 (preflight, gates Waves A-C)
Tracker PR: [#129](https://github.com/Luis85/agentonomous/pull/129) — every PR cut from this plan must include `Tracks: #129` in its body.
Companion docs:
- Planning doc: [`docs/product/2026-04-26-pre-v1-demo-evolution-plan.md`](../product/2026-04-26-pre-v1-demo-evolution-plan.md)
- Design doc: [`docs/specs/2026-04-26-pre-v1-demo-evolution-design.md`](../specs/2026-04-26-pre-v1-demo-evolution-design.md)
- Spec: [`docs/specs/2026-04-26-pre-v1-demo-evolution-spec.md`](../specs/2026-04-26-pre-v1-demo-evolution-spec.md) → see **Wave-0** section.

## Goal

Rename `examples/nurture-pet/` → `examples/product-demo/` as a single
atomic PR that updates folder + scripts + GitHub Pages workflow + tests +
docs in one diff. Wire the new `npm run e2e` Playwright entry point so
later pillar PRs can rely on it from day 1.

## Pre-flight

- Branch from current `develop`.
- Worktree at `.worktrees/feat-rename-product-demo/`.
- No other PR may touch `examples/nurture-pet/**` while this slice is
  in flight; coordinate before starting.

## Roadmap

Wave 0 is intentionally a **single PR**. Splitting it would break the
"atomic delivery slice (no split merge)" rule the planning doc imposes
on the rename.

| # | Slice | Files | Spec FRs | Status | PR |
|---|---|---|---|---|---|
| 0.1 | Atomic rename + script + workflow + doc sweep + Playwright skeleton | `examples/nurture-pet/` → `examples/product-demo/`, `package.json`, `.github/workflows/pages.yml`, `README.md`, `CLAUDE.md`, `PUBLISHING.md`, `docs/**`, `tests/**`, new `examples/product-demo/playwright.config.ts` | R-FR-1 … R-FR-8 | not started | — |

## Slice 0.1 — Atomic rename

### Steps (in order, single PR)

1. `git mv examples/nurture-pet examples/product-demo`.
2. Update root `package.json` scripts:
   - `demo:install`, `demo:dev`, `demo:build` shell into the new path.
   - Add `e2e`: `npm --prefix examples/product-demo run e2e`.
3. Update `.github/workflows/pages.yml`: artifact path
   `examples/product-demo/dist`.
4. Add a placeholder Playwright config under
   `examples/product-demo/playwright.config.ts` and an empty
   `examples/product-demo/tests/e2e/` directory; the named scripts are
   added by the pillar PRs that own them.
5. Add ESLint `no-restricted-imports` rules to the workspace's ESLint
   config matching the design's forbidden-import table (so violations
   in later pillar PRs fail CI).
6. Sweep `examples/nurture-pet` references across all tracked files and
   replace with `examples/product-demo`. Verification (do not commit
   the helper script — run it manually):
   ```bash
   git grep -n "examples/nurture-pet" -- ':(exclude).worktrees/**' ':(exclude)docs/archive/**'
   ```
   Must return zero matches before the PR is opened.
7. Update top-level docs in the same PR: `README.md`, `CLAUDE.md`,
   `PUBLISHING.md`, plus any non-archived `docs/**` references.
8. Delete legacy `nurture-pet.*` and un-prefixed `demo.*` localStorage
   keys on first load via a one-shot dev-only purge in
   `examples/product-demo/src/app/main.ts` (per spec STO-3).
9. `npm run verify` + `npm run e2e` must pass locally.
10. Open PR with body line `Tracks: #129`. Add the PR to the GH
    tasklist on PR #129 and tick its row in the planning doc's tracker
    table in the same diff.

### Pre-merge dry-run gate (R-FR-7)

Before merging:

- `npm run demo:build` succeeds against `examples/product-demo`.
- The Pages workflow's resolved artifact path is
  `examples/product-demo/dist` (verify in the rendered workflow YAML).
- The Pages deploy job's `working-directory`/`path` references resolve.

### Post-merge verification (R-FR-8)

After the merge to `develop` and after the planning team promotes to
the `demo` branch (per `PUBLISHING.md#demo-deployment`):

- The public Pages URL serves the renamed workspace's build.
- DevTools confirms no `nurture-pet.*` keys remain in localStorage on
  a clean profile.

## Verification gates

- `npm run verify` — green.
- `npm run e2e` — exits 0 against the placeholder config (no scripts
  yet but the command must work).
- `git grep "examples/nurture-pet"` excluding `.worktrees/` and
  `docs/archive/` returns zero matches.
- Pages workflow dry-run resolves the new artifact path.

## Definition of done

- Spec criteria R-AC-1, R-AC-2, R-AC-3, R-AC-4 all met.
- PR #129 tracker table row for "Demo rename" set to ✅ with the merged
  PR linked.
- Tracker PR #129 GH tasklist entry for this PR ticked.

## Done log

_Append one bullet per slice as it ships:_

- (none yet)
