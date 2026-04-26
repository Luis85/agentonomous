# `actions-bump-bot/` — weekly action SHA-bump routine

Source files for the scheduled remote agent that keeps every
SHA-pinned `uses:` reference in `.github/workflows/*.yml` at its
latest release tag. The routine wraps the existing
[`scripts/bump-actions.mjs`](../../scripts/bump-actions.mjs) (which
already handles annotated tags via its peel-aware `tagToCommitSha`
helper) into a weekly PR-opening workflow: walk the workflows, apply
every non-major pending bump, run `actionlint` + `npm run verify`,
and open one PR per run with the diff. Owner reviews and merges.

Sibling of `docs/review-bot/`, `docs/docs-review-bot/`, and
`docs/dep-triage-bot/` — same skeleton, different target. Where
`review-bot/` reviews **code commits**, `docs-review-bot/` reviews
**docs drift**, and `dep-triage-bot/` drains the **Dependabot PR
pile**, this routine drains the **action SHA-bump backlog**.

## Layout

| File                       | Purpose                                                  |
| -------------------------- | -------------------------------------------------------- |
| [`PROMPT.md`](./PROMPT.md) | System prompt the routine loads at the start of each run. |
| [`README.md`](./README.md) | This file — routine setup, sinks, iteration workflow.   |

## Output sink

**One PR per run, primary sink.** Title
`chore: bump pinned action SHAs (YYYY-MM-DD)`, branch
`chore/actions-bump-YYYY-MM-DD`, base `develop`. The PR body holds
the full per-run output: a table of applied bumps
(`action / old SHA / new SHA / old label / new label / workflow
file(s)`) and a verify-status footer. The owner reviews the diff
and merges.

There is **no per-run issue when verify passes**. The PR itself is
the run's artifact. Same convention as the refactored daily
`review-bot` (issue per run, body holds findings) — except the
artifact here is a PR rather than an issue, because the routine's
output is a code change rather than a triage report.

**Failure issues, secondary sink.** Four distinct issue title shapes
under the `actions-bump-bot` label cover every failure path:

- `Action SHA bumps YYYY-MM-DD — script error` — `scripts/bump-actions.mjs`
  reported `ERROR` rows (auth / network / rate-limit / missing CLI).
  Aborts the run.
- `Divergent action pins: <owner>/<repo>` — one issue per divergent
  action when the same action is pinned to multiple SHA/label tuples
  across workflows. Filed alongside any bump PR, never in place of one.
- `Unresolved action pins YYYY-MM-DD` — one issue per run grouping
  every `no-releases` / `unresolved` row from the scan. Filed
  alongside any bump PR.
- `Action SHA bumps YYYY-MM-DD — <sha7>` — `actionlint` or
  `npm run verify` failed after applying bumps. Bump branch is
  reverted locally before the issue is filed.

The owner triages from the `actions-bump-bot` label view and closes
each issue manually once the underlying breakage is resolved. See
the prompt's
[Failure handling](./PROMPT.md#failure-handling) and
[Failure-issue spec](./PROMPT.md#failure-issue-spec) for the exact
body shape of each.

There is no per-PR or per-bump state to carry across runs (this
routine opens at most one PR per run, against a fresh dated
branch). The dep-triage bot uses per-PR comment markers because it
triages multiple Dependabot PRs per run; this bot does not.
Idempotency is bounded by a search for **any** still-open
`chore/actions-bump-*` PR authored by `ROUTINE_GH_LOGIN` — older
unmerged bump PRs also block a new run, not just this week's. See
the prompt's [Idempotency](./PROMPT.md#idempotency) section.

A run is a true no-op only when `scripts/bump-actions.mjs` exits 0
**and** the column-6 status scan finds zero `no-releases` /
`unresolved` rows. In that case the routine opens no PR and no
issue — quiet runs leave no trace, same convention as the daily
`review-bot` and the weekly `dep-triage-bot`. Exit 0 with
`no-releases` / `unresolved` rows present is **not** a no-op:
the routine still files an `Unresolved action pins YYYY-MM-DD`
triage issue per the prompt's
[Failure handling](./PROMPT.md#failure-handling) and exits 0.

## Setup checklist (one-time)

- [ ] Confirm the `actions-bump-bot` label exists on the repo. Bare
      `gh label create` returns a non-zero error when the label
      already exists (only `--force` updates an existing label,
      which would clobber its description/color). Gate creation
      behind an existence check:

      ```bash
      if ! gh label list --search actions-bump-bot --json name \
           --jq '.[] | select(.name == "actions-bump-bot") | .name' \
         | grep -q .; then
        gh label create actions-bump-bot --color D93F0B \
          --description "Failure issues from the weekly actions-bump cloud routine"
      fi
      ```

      The label was added in the same increment that landed this
      routine, so the existence check usually short-circuits.
- [ ] Add `.actions-bump-cache/` to `.gitignore` (one line). The
      routine writes `FAILED-pr-body-<date>.md` and
      `FAILED-issue-body-<date>.md` files there if `gh pr create`
      or `gh issue create` fail so you can re-submit by hand.
- [ ] Verify the routine has the right GitHub token scopes:
      `pull-requests:write` (open the bump PR), `issues:write`
      (open failure issues, manage labels),
      `contents:write` (push the `chore/actions-bump-<date>` branch
      to `origin` — the bump branch lives on the repo, not on a
      fork). No write to `develop` itself — the routine only ever
      pushes to its own dated topic branch.
- [ ] Set `ROUTINE_GH_LOGIN` in the routine's env to the GitHub
      login the routine actually posts as. Two common setups:
      - **PAT-driven cloud routine** (e.g. Anthropic Cloud routine
        running under your own Personal Access Token): set
        `ROUTINE_GH_LOGIN=<your-github-username>` (the PR will
        appear authored by that human user with
        `user.type == "User"`).
      - **GitHub App / dedicated bot account**: set
        `ROUTINE_GH_LOGIN=<bot-login>` (e.g. `claude[bot]`).

      The prompt's
      [Idempotency check](./PROMPT.md#idempotency) uses this login
      as the trust boundary for "is there already an unmerged bump
      PR open from us?" — the search blocks on **any** still-open
      `chore/actions-bump-*` PR from this login, regardless of when
      it was opened. The check deliberately does NOT constrain
      `user.type` — that would silently disable the dedupe on
      PAT-based runs. It exits non-zero if the env var is unset, so
      a misconfigured run cannot accidentally open duplicate bump
      PRs against an unfiltered author list.
- [ ] Confirm `gh` and `node` are on the routine's PATH and
      authenticated. `scripts/bump-actions.mjs` shells out to
      `gh api` for every action lookup; without auth the script
      exits 1 with `ERROR` rows and the routine aborts cleanly per
      the prompt's [Failure handling](./PROMPT.md#failure-handling).
- [ ] Optionally install `actionlint` locally (or rely on the
      Dockerized invocation in the prompt). The prompt uses
      `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color`
      to avoid a host install — if Docker isn't available on the
      routine runner, swap in a local `actionlint` binary.
- [ ] Dry-run once with `DRY_RUN=1` set in the routine's env. The
      prompt's [Dry-run mode](./PROMPT.md#dry-run-mode) section
      guards every `git push`, `gh pr create`, `gh issue create`,
      and `gh label create` call behind a `DRY_RUN` check; in
      dry-run mode each is replaced by a stdout dump of the
      would-be call + body. The local `npm ci && npm run verify`
      step still runs so verify-pass / verify-fail signals are
      realistic.

## Routine wrapper prompt (paste into the routine)

The routine itself only needs a tiny wrapper that points at this
file and lets the system prompt do the heavy lifting. Paste this
exact text into the routine's `events[].data.message.content` (one
user message):

> You are running the scheduled `actions-bump-bot` routine for the
> `agentonomous` repo.
>
> Steps:
>
> 1. Clone / refresh the repo on `develop`:
>    `git fetch origin && git switch develop && git pull --ff-only origin develop`
> 2. Read the system prompt at `docs/actions-bump-bot/PROMPT.md`
>    and follow it verbatim. That file is the source of truth for
>    how to detect pending bumps, the hard rules, the PR shape,
>    failure handling, idempotency, and dry-run rules. Do not
>    re-derive any of that from this message.
> 3. After opening the bump PR (or recognizing a no-op run and
>    exiting cleanly without opening anything), exit cleanly. A true
>    no-op requires `scripts/bump-actions.mjs` to exit 0 **and** the
>    column-6 status scan to find zero `no-releases` / `unresolved`
>    rows — exit code alone is not sufficient. The script also exits
>    non-zero for `DIVERGENT` and `ERROR` states even when `PENDING`
>    is zero, and exits 0 with `no-releases` / `unresolved` rows
>    that still require a triage issue. All of those paths are
>    covered by the prompt's
>    [Failure handling](./PROMPT.md#failure-handling) and
>    [No-op detection](./PROMPT.md#no-op-detection) sections. Do
>    NOT merge the PR yourself. Do NOT push to `develop`, `main`, or
>    `demo`. Do NOT edit anything outside `.github/workflows/` (both
>    `*.yml` and `*.yaml`) in the bump branch.
>
> If `docs/actions-bump-bot/PROMPT.md` does not exist on `develop`
> for some reason, abort with a clear error — do not improvise a
> bump policy without the prompt.

That wrapper is intentionally short. The system prompt is versioned
in-repo so changes go through PR review like any other doc change —
the routine itself doesn't need to be re-edited every time the
prompt evolves.

## Cadence

Recommended: **weekly, Monday morning**, a few minutes off the `:00`
mark for fleet courtesy (avoids the cron stampede that hits every
scheduled bot at the top of the hour). A reasonable cron in UTC:

- `7 8 * * 1` — every Monday at 08:07 UTC (10:07 Europe/Berlin),
  one hour and seven minutes after Dependabot fires
  (`.github/dependabot.yml` runs Dependabot at 06:00 UTC Monday).
  The seven-minute offset spreads load relative to other Monday
  routines (`dep-triage-bot` recommends `0 8 * * 1`); the one-hour
  cushion gives Dependabot time to actually finish opening grouped
  PRs before this routine starts editing the workflows they
  reference.

The routine no-ops cleanly when `scripts/bump-actions.mjs` exits 0:
no PR is opened, no issue is opened, no branch is pushed. If every
pin matches its latest release for several weeks running, the
`actions-bump-bot` label view simply shows nothing new landing —
that's the desired silence.

## Iteration workflow (changing the prompt)

The prompt evolves as you discover false positives, missed hard
rules, or output-format pain. To change it:

1. Cut a topic branch from `develop`
   (`docs/actions-bump-prompt-tweak` or similar) under
   `.worktrees/<branch-slug>` per `CLAUDE.md`.
2. Edit [`PROMPT.md`](./PROMPT.md). Keep section structure stable
   so the routine doesn't break on a missing header.
3. Open a PR against `develop`. Doc-only diff → CI short-circuits
   to `ci-gate` only (~1 minute).
4. After merge, the next scheduled run picks up the new prompt.

## Known tradeoffs

- **Major bumps never auto-apply.** Even on dev-tier actions
  (`actions/upload-artifact v5 → v7` is a recent example). The
  routine flags the major in a fresh `actions-bump-bot` issue with
  the upstream changelog summary and leaves the bump out of the
  weekly PR. The owner reviews the changelog and lands the major
  on a separate manual PR. This is a deliberate safety bias —
  major action bumps frequently change inputs / outputs / runtime
  in ways the bot can't validate without human review.
- **Divergent pins escalate, never auto-reconcile.** If the same
  action is pinned to different SHA/label tuples across workflows
  (e.g. `actions/checkout@<sha-A> # v6.0.1` in one file and
  `actions/checkout@<sha-B> # v6.0.2` in another), the routine
  files an issue and skips the action entirely for the run. The
  owner picks one canonical version in a separate PR, and the
  next run's bump catches up. This avoids the bot guessing the
  intended version when the workflows themselves disagree.
- **`scripts/bump-actions.mjs` exit 1 != failure.** The script
  exits 1 whenever any pin is `PENDING`, `DIVERGENT`, or `ERROR`
  — it's a CI-gate-friendly contract, not a "the script crashed"
  signal. The routine MUST distinguish these by parsing stdout,
  not by treating exit 1 as a hard failure. Real script failure
  surfaces as `ERROR` rows in the table.
- **`ERROR` rows abort the entire run.** If the script can't
  resolve any single action (network, auth, rate-limit, 5xx), the
  routine files an issue and skips the run — it does NOT apply
  the partial bump set for the resolvable actions. This avoids
  silently shipping a half-applied bump batch when GitHub's API
  is flaky. The next week's run retries from a clean state.
- **Verify failures revert the branch entirely, not per-bump.**
  If `npm run verify` fails after applying five bumps, the
  routine reverts all five and files one failure issue. It does
  NOT bisect to find the offending bump — that's manual triage
  work for the owner. Bisecting blindly risks shipping a
  partially-applied batch that masks an unrelated regression.
- **Failure issue list grows over time.** Each verify-failed run
  opens an issue. Close each issue once the underlying breakage
  is resolved (typically the failing action publishes a follow-up
  release that fixes the regression, or the workflow gets
  adjusted in a manual PR). Closed issues drop out of the
  `actions-bump-bot` label view automatically.
- **No idempotency markers on the bump PR itself.** The routine
  opens at most one PR per run against a fresh dated branch
  (`chore/actions-bump-YYYY-MM-DD`); if a re-run finds **any**
  still-open `chore/actions-bump-*` PR from `ROUTINE_GH_LOGIN`
  (regardless of when that PR was opened), it exits silently. This
  intentionally diverges from `dep-triage-bot`'s per-PR-comment
  markers — there's nothing per-PR to track here because the
  artifact IS the PR.

## Bot label convention

Each scheduled cloud routine in this repo owns a dedicated GitHub
label so its issues group cleanly under one filter:

| Routine                  | Label              |
| ------------------------ | ------------------ |
| `docs/review-bot/`       | `review-bot`       |
| `docs/docs-review-bot/`  | `docs-review`      |
| `docs/dep-triage-bot/`   | `dep-triage-bot`   |
| `docs/actions-bump-bot/` | `actions-bump-bot` |

Each per-run issue carries exactly its routine's label — no
cross-labelling, no shared `automation` umbrella label. Filter the
issue list by label to see one routine's full failure history. For
this routine specifically, the label view is **failure-only** by
design: green runs leave a PR (visible on the PR list), not an
issue. A non-empty `actions-bump-bot` label view always means
"something went wrong this run".

## Related

- The script this routine wraps:
  [`scripts/bump-actions.mjs`](../../scripts/bump-actions.mjs).
  Read-only by design — the routine adds the apply / verify / PR /
  failure-issue layer on top.
- Sibling routines: `docs/review-bot/` (daily code review of
  `develop` commits, dual sink: per-run issue + committed daily
  docs), `docs/docs-review-bot/` (weekly docs-drift audit, fresh
  issue per run), `docs/dep-triage-bot/` (weekly Dependabot PR
  drainer, per-run issue + per-PR comment markers).
- Branch / changeset / verify policy that the prompt's hard rules
  reference: `CLAUDE.md`, `CONTRIBUTING.md`, `STYLE_GUIDE.md`.
- Umbrella tracker for the quality-automation increment that
  introduced this routine:
  [Issue #131](https://github.com/Luis85/agentonomous/issues/131)
  (durable record) ·
  [PR #130](https://github.com/Luis85/agentonomous/pull/130)
  (planning surface) · row 3 of
  [`docs/plans/2026-04-26-quality-automation-routines.md`](../plans/2026-04-26-quality-automation-routines.md).
- Peel-aware SHA helper used by the prompt's hard rules:
  [`resolve_action_sha`](../plans/2026-04-26-quality-automation-routines.md#resolve-an-action-tag--commit-sha-peel-aware-helper)
  in the umbrella plan.
