# Quality automation routines — umbrella tracker

> **Role.** This file is the **umbrella tracker** for the quality-
> automation increment. It does **not** contain implementation steps
> directly — each row links to its own self-contained chunk plan that
> is sized to ship as a single downstream PR off `develop`.
>
> **For agentic workers:** pick a row from the [Tracker table](#tracker-table)
> below, open the linked chunk plan, follow it top-to-bottom on a
> fresh worktree branch cut from `develop` (NOT from this PR's branch),
> and open the downstream PR per the contract below. PR #130 itself
> stays open, draft, until every row in the tracker is shipped.

---

## Goal

Close known quality / supply-chain / drift gaps not covered by the
existing CI gate or the daily-code-review + weekly-docs-review
routines. Adds eight independently-shippable automation surfaces:
five CI/cron jobs, three cloud-routine prompt directories.

## Architecture (compressed)

- **GitHub Actions workflows** for jobs that run inside CI infra
  (CodeQL, mutation, Playwright smoke, bundle-size trend, determinism
  replay).
- **Cloud-routine prompt directories** (`docs/<bot-name>/PROMPT.md` +
  `README.md`) for jobs that need an LLM-driven agent (dep-triage,
  action-SHA bumps, plan reconciliation). Same shape as the existing
  `docs/review-bot/` and `docs/docs-review-bot/`.
- **No core library changes.** All additions live under `.github/`,
  `docs/`, `tests/determinism/`, and the demo workspace (currently
  `examples/nurture-pet/`; see [Coordination with PR #129](#coordination-with-pr-129-demo-rename)).
  No `src/**` edits. No changesets needed (tooling-only PRs).

## Tech stack

- GitHub Actions, Dependabot, CodeQL.
- StrykerJS (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`).
- Playwright (`@playwright/test`).
- Existing `scripts/bump-actions.mjs`, `scripts/coverage-pr-comment.mjs`
  pattern for any new helper scripts.

## Out of scope

- Stale-branch cleaner — explicitly deferred per owner decision (2026-04-26).
- Type-coverage report, license/SBOM audit, mutation testing on examples
  — punt to a future plan if value materializes.

---

## Coordination with PR #129 (demo rename)

PR [#129](https://github.com/Luis85/agentonomous/pull/129) is the
umbrella tracker for the pre-v1 demo evolution increment. **Wave 0 of
that increment is an atomic single-PR rename** of
`examples/nurture-pet/` → `examples/product-demo/` (see
`docs/plans/2026-04-26-pre-v1-demo-rename-preflight.md` once #129
merges). The rename PR is responsible for sweeping every reference
across the repo — scripts, GitHub Pages workflow, README, CI, and (if
it lands after this increment's demo-smoke row) the Playwright wiring
that row introduces.

**Path policy across all chunk plans below:**

| Section | What it uses today | After Wave 0 of #129 |
| --- | --- | --- |
| Demo-smoke chunk paths | `examples/nurture-pet/...` | `examples/product-demo/...` |
| `.gitignore` rules touching the demo | `examples/nurture-pet/...` | `examples/product-demo/...` |

**Sequencing rule (decide at the start of the demo-smoke row):**

1. **If Wave 0 has merged into `develop` before the demo-smoke row
   starts** — pull `develop`, resolve conflicts via
   `git merge origin/develop` (NOT rebase, per
   `MEMORY.md → feedback_parallel_pr_plan_conflicts.md`), then
   substitute `examples/nurture-pet/` → `examples/product-demo/` in
   every file that row creates or touches.
2. **If Wave 0 has NOT merged before that row starts** — implement
   verbatim against `examples/nurture-pet/`. The Wave 0 rename PR will
   sweep this increment's additions the same way it sweeps every
   other reference. Add a one-line note on the Wave 0 PR when it
   opens calling out that this increment introduced new
   `examples/nurture-pet/` paths so the sweep is complete.

**Do not pre-rename in any chunk plan.** A single mechanical sed in
the Wave 0 PR converges everything; pre-renaming half-and-half forces
a manual reconciliation in two places and risks Codex re-flagging
path mismatches between this plan and `develop` truth.

---

## Tracker table

PR #130 (this PR) is **draft** until every row below is shipped. Each
row's downstream PR ticks its own checkbox in the same diff that
lands the work, then this tracker auto-flips when its source PR
merges.

| #   | Chunk plan | Scope (one-line) | Cadence | Touches `src/`? | Status |
| --- | --- | --- | --- | --- | --- |
| 1   | [quality-codeql.md](./2026-04-26-quality-codeql.md) | Weekly + push CodeQL JS/TS scan, `security-and-quality` query suite | weekly + push | no | - [ ] not started |
| 2   | [quality-dep-triage-bot.md](./2026-04-26-quality-dep-triage-bot.md) | Cloud routine prompt + `dependabot.yml` grouping for weekly Dependabot triage | weekly | no | - [ ] not started |
| 3   | [quality-actions-bump-bot.md](./2026-04-26-quality-actions-bump-bot.md) | Cloud routine prompt that runs `scripts/bump-actions.mjs` weekly + opens a bump PR | weekly | no | - [ ] not started |
| 4   | [quality-plan-recon-bot.md](./2026-04-26-quality-plan-recon-bot.md) | Cloud routine prompt that archives shipped plans monthly | monthly | no | - [ ] not started |
| 5   | [quality-bundle-trend.md](./2026-04-26-quality-bundle-trend.md) | Weekly snapshot of `npx size-limit --json` to a committed JSONL trend file | weekly | no | - [ ] not started |
| 6   | [quality-determinism-replay.md](./2026-04-26-quality-determinism-replay.md) | Weekly + push hash-pinned replay across 8 seeds with committed baseline | weekly + push | no (tests/) | - [ ] not started |
| 7   | [quality-mutation-testing.md](./2026-04-26-quality-mutation-testing.md) | Weekly StrykerJS mutation run with HTML report artifact | weekly | no | - [ ] not started |
| 8   | [quality-demo-smoke.md](./2026-04-26-quality-demo-smoke.md) | Nightly Playwright headless smoke against built demo | nightly + PR-path | no (demo/) | - [ ] not started |

> **Tick rule.** A row's box flips to `[x]` when its downstream PR
> merges into `develop`. Edit the row in the same diff that lands the
> work — don't open a follow-up "tracker update" PR (per
> `MEMORY.md → feedback_docs_alongside_pr.md`).

---

## Downstream PR contract

Every PR cut from a chunk plan above MUST:

1. **Branch off `develop`**, NOT off this tracker's branch
   (`chore/quality-automation-routines`). Worktree path:
   `.worktrees/<branch-slug>` per `CLAUDE.md`.
2. **Include the body line `Tracks: #130`** so GitHub auto-links the
   PR back to this tracker.
3. **Tick its row in the [Tracker table](#tracker-table)** in the same
   diff (same commit, even — no follow-up "tracker update" PR).
4. **Pass `npm run verify`** locally before opening (the existing
   pre-PR gate). Workflow rows additionally pass `actionlint` clean.
5. **Pin every new GHA `uses:` reference to a 40-char commit SHA**
   resolved via the helper in
   [Verification gate](#verification-gate-shared) below — never
   `gh api .../refs/tags/<tag> --jq '.object.sha'` directly
   (annotated tags break that path).
6. **No changeset.** All eight chunks are tooling-only; pre-1.0 docs/
   chore PRs skip changesets per `CLAUDE.md`.
7. **Codex review** runs automatically on open. Address findings per
   `MEMORY.md → feedback_pr_codex_polling.md` /
   `feedback_codex_signal_endpoints.md`.

> **Why one-PR-per-chunk now, not one giant PR?** Earlier drafts of
> this plan bundled all eight rows on a single branch (#130). After
> three Codex passes the surface had grown to ~1390 lines and review
> latency was the dominant cost. Splitting into eight chunk plans:
> (a) lets independent agents work rows in parallel, (b) keeps each
> Codex review pass narrowly scoped, (c) bounds the blast radius if
> any single row needs revert. The tracker stays open so the parent
> intent is still visible across rows.

---

## Verification gate (shared)

Each chunk row ends with `npm run verify` passing locally before
commit. Workflow rows additionally pass `actionlint` (already wired
into CI), runnable locally via:

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color
```

Every new GHA `uses:` reference must use a full 40-char commit SHA
with a trailing `# vX.Y.Z` comment (per the supply-chain rule in the
existing CI header).

### Resolve an action tag → commit SHA (peel-aware helper)

> **Why a helper, not just `gh api .../commits/<tag>`?** Many actions
> publish **annotated tags**. `gh api .../git/refs/tags/<tag>` on an
> annotated tag returns the tag-object SHA, not the underlying
> commit. Pinning that tag-object SHA in `uses:` produces a
> non-resolvable reference. The repo's own `scripts/bump-actions.mjs`
> already handles this via `object.type` + a `git/tags/<sha>`
> dereference (see lines 142–195 of that script). Use the helper
> below for every SHA-resolve step in any chunk plan.

Drop this Bash function into the shell (or a scratch file you
`source`) before working any row that needs SHAs:

```bash
# Resolve <owner>/<repo>@<tag> → 40-char commit SHA. Peels annotated
# tags. Echoes the SHA on stdout; non-zero exit on missing/unsupported.
resolve_action_sha() {
  local owner="$1" repo="$2" tag="$3"
  if [[ -z "$owner" || -z "$repo" || -z "$tag" ]]; then
    printf 'usage: resolve_action_sha <owner> <repo> <tag>\n' >&2
    return 2
  fi
  local payload kind sha
  payload="$(gh api "repos/${owner}/${repo}/git/ref/tags/${tag}")" || return 1
  kind="$(jq -r '.object.type' <<<"${payload}")"
  sha="$(jq -r '.object.sha'  <<<"${payload}")"
  case "${kind}" in
    commit) printf '%s\n' "${sha}" ;;
    tag)    gh api "repos/${owner}/${repo}/git/tags/${sha}" --jq '.object.sha' ;;
    *)      printf 'unsupported ref type %s for %s/%s@%s\n' \
              "${kind}" "${owner}" "${repo}" "${tag}" >&2; return 1 ;;
  esac
}
```

Sanity check the helper before relying on it:

```bash
resolve_action_sha actions checkout v6.0.2
resolve_action_sha actions setup-node v6.4.0
```

Both must echo a 40-char hex string. Anything else → fix the helper
before continuing.

> **Lazier alternative.** `node scripts/bump-actions.mjs --help` does
> not yet expose a one-shot `--resolve` mode. Until it does, use the
> helper above.

---

## Risk register (read once before picking a chunk)

- **Stryker runtime explosion.** If the suite balloons past 45 min on
  a single runner, drop `concurrency` to match the runner's vCPU
  count and / or split the `mutate` glob across two workflow jobs
  (e.g. `src/agent/**` vs. everything else). Don't lower the
  threshold to paper over slowness.
- **Determinism baseline drift.** Any legitimate library change that
  alters trace contents (new event type, reordered tick stage)
  invalidates `baseline.json`. Treat that as an explicit re-baseline
  step in the same PR that changes behavior (run
  `npm run determinism:baseline`, inspect the diff, commit it
  alongside the trace-changing code) — never bypass the assertion or
  weaken it to match the new digests silently.
- **Playwright flake.** The demo loads tfjs which probes WebGL → WASM
  → CPU on startup. In CI on Ubuntu, expect WASM. Allow `retries: 1`
  but never higher; >1 retries hides real flakes.
- **Bot-pushed develop commits.** The bundle-trend chunk pushes a
  metrics row directly to `develop` from a workflow. If branch
  protection blocks this, pivot to PR-bot path documented in that
  chunk. Don't weaken protection.
- **Action SHA churn.** Every new workflow added under this increment
  uses pinned SHAs. After each chunk merges, the next
  `actions-bump-bot` run will attempt to bump them. That's expected
  — review that bump PR like any other.
- **Demo rename in flight (PR #129 / Wave 0).** Demo-smoke chunk
  paths point at `examples/nurture-pet/`. If Wave 0 of PR #129 lands
  first, every demo-smoke path becomes `examples/product-demo/`.
  Follow the chunk plan's first step to detect, then substitute
  mechanically. Do NOT ship `examples/product-demo/` paths from a
  chunk before Wave 0 has merged — the directory does not exist on
  `develop` yet.

---

## When to mark this tracker shipped

When every row in the [Tracker table](#tracker-table) is `[x]`:

1. Mark PR #130 ready-for-review (`gh pr ready 130`).
2. Squash-merge the tracker PR (the only diff at that point will be
   this umbrella file + the eight chunk plan files — they live
   permanently as a historical record of the increment).
3. After merge, `git mv docs/plans/2026-04-26-quality-*.md
   docs/archive/plans/` in a single follow-up `chore(docs)` commit on
   `develop`. Per `MEMORY.md → feedback_docs_alongside_pr.md`, this
   archive sweep is the only doc move that ships outside the
   originating PR — because by definition the originating PR is the
   tracker itself, which is being merged.
