> **Archived 2026-04-26.** Completed in #124 (sticky PR coverage-delta comment).

---
date: 2026-04-26
slug: review-bot-nit-coverage-thresholds-hardcoded-at-42ede76-3
finding-id: 42ede76.3
tracker: '#87'
severity: NIT
---

# Fix review finding `42ede76.3` — Coverage thresholds hardcoded at one-time baseline

## Source

From `#87` comment 4321324736, finding `42ede76.3`:

> **[NIT]** `vite.config.ts:176` — Coverage thresholds hardcoded at one-time baseline; no CI feedback when coverage improves
>
> **Problem:** Thresholds are static integers (`statements: 74, branches: 64, functions: 83, lines: 75`) derived from a single point-in-time measurement; if coverage climbs 10pp over the next quarter, the gate still passes at 74%
>
> **Why it matters:** The "don't let coverage regress" property weakens as the gap between actual and threshold widens; a 15pp regression would still pass
>
> **Fix:** Add a comment in the CI step that reminds to re-baseline after a coverage-improving PR lands, or automate a separate check that prints a warning when actual ≫ threshold (unverified — check vitest coverage diff reporters)

## Approach

Owner steered: rather than the bot's "advisory `::warning::` annotation"
suggestion, mirror the existing `size-limit` sticky-PR-comment pattern.
A reviewable Markdown table on the PR is much higher signal than a
buried CI annotation, and it leverages infra that already exists
(`andresz1/size-limit-action` posts the size-limit equivalent).

Implementation:

1. **Single source of truth for thresholds.** Extract the four
   floors (`statements/branches/functions/lines`) plus the drift
   envelope (`DRIFT_WARN_PP = 5`) into
   `scripts/coverageThresholds.mjs`. `vite.config.ts` imports it for
   the actual gate; the PR-comment script imports it for floor
   labels and drift-warning thresholds. A `coverageThresholds.d.mts`
   shim gives TS / ESLint type-checked references.
2. **Vitest emits machine-readable summary.** Add `json-summary` to
   `coverage.reporter` in `vite.config.ts` so
   `coverage/coverage-summary.json` is produced alongside the
   existing text/html/lcov reports.
3. **Sticky PR comment.** New `scripts/coverage-pr-comment.mjs`:
   - reads `coverage/coverage-summary.json` (PR head)
   - optionally reads a base-branch summary (passed via `--base-summary`)
   - renders a Markdown table — actual %, delta vs base, floor,
     status (`✅` / `❌ below floor` / `⚠️ Npp above floor — consider
     re-baselining`)
   - upserts a sticky comment via the GitHub REST API, identified by
     hidden marker `<!-- coverage-pr-comment -->`
   - `--render-only` mode prints to stdout (used by
     `npm run coverage:report` for local preview)
4. **CI wiring.** Two changes in `.github/workflows/ci.yml`:
   - `test-core` (ubuntu cell) uploads `coverage/coverage-summary.json`
     as artifact `coverage-summary` (with `if: always()` so a vitest
     threshold failure still ships the numbers — that's exactly when
     reviewers need the table).
   - New `coverage-pr-comment` job (parallel to `size-limit-comment`):
     downloads the PR run's artifact, downloads the latest successful
     `develop` run's same artifact via `gh run download`, runs the
     comment script with `--post`. Permissions: `pull-requests: write`,
     `actions: read`. Not added to `ci-gate` needs — it is purely
     informational, never a blocker.

Out of scope (separate PR): cyclomatic-complexity tracking. Tooling
choice is non-trivial (`eslint complexity` is already a warning rule
but file/function-level complexity, `code-complexity`, `madge`, etc.
all emit different shapes) and complexity drift is slow-moving — bad
fit for per-PR delta surface. Open as its own polish-and-harden roadmap
row when desired.

## Acceptance

- `npm run verify` green locally.
- `npm run coverage:report` renders the same Markdown table that CI
  will post (without the GitHub API call).
- New CI job `coverage-pr-comment` posts a sticky comment on this PR
  showing 4 metrics + their delta vs the latest successful develop
  run's coverage. (First push may show "base summary not available"
  if the artifact retention has expired or develop hasn't yet
  produced a run with the artifact — expected.)
- Codex review acknowledged or rebutted on each thread.

## Rollout

- Branch: `fix/review-bot-nit-coverage-thresholds-hardcoded-at-42ede76-3` (already cut by review-fix skill).
- PR base: `develop`.
- PR body MUST contain on its own line: `Refs #87 finding:42ede76.3`.
- PR body MUST NOT contain `Closes #87` / `Fixes #87`.
- No changeset — tooling/CI-only change, no library behavior delta.
