# `plan-recon-bot/` — monthly plan-archive cloud routine

Source files for the scheduled remote agent that walks
`docs/plans/*.md` once a month, decides which plans are done, and
archives them into `docs/archive/plans/` via `git mv`. Outputs are
shipped as a single archive PR per run; failure runs open a dedicated
failure issue under the `plan-recon-bot` label.

Sibling of `docs/review-bot/`, `docs/docs-review-bot/`, and
`docs/dep-triage-bot/` — same skeleton, different target.

## Layout

| File                          | Purpose                                                  |
| ----------------------------- | -------------------------------------------------------- |
| [`PROMPT.md`](./PROMPT.md)    | System prompt the routine loads at the start of each run. |
| [`README.md`](./README.md)    | This file — routine setup, sinks, iteration workflow.   |

## Output sink

**Primary: one archive PR per run** with at least one move. Title
`docs(archive): plan reconciliation YYYY-MM-DD`, base `develop`,
branch `docs/plan-recon-YYYY-MM-DD`. Body lists each archived plan
with `(plan, last shipped row evidence, archive reason)`.

**Secondary: failure issue**, opened only when the run aborts
(`git mv` fails, `npm run verify` fails, parse breaks, etc.). Title
`Plan reconciliation YYYY-MM-DD — <head-sha7>`, label
`plan-recon-bot`. Body holds the failure tail. Each failure issue is
self-contained — owner closes manually once resolved.

**Quiet runs leave no trace.** No moves needed → no PR, no issue,
exit cleanly. An empty `plan-recon-bot` label view = nothing happened
recently. Same convention as the refactored `review-bot`,
`docs-review-bot`, and `dep-triage-bot`.

## Distinction from sibling routines

- **`docs/review-bot/`** = adversarial code review of recent commits
  on `develop` (per-run issue under `review-bot` label).
- **`docs/docs-review-bot/`** = audits prose drift across the repo
  against the current code (per-run issue under `docs-review` label).
- **`docs/plan-recon-bot/`** (this routine) = answers "is this plan
  done?" by walking `docs/plans/*.md` and archiving finished ones via
  `git mv`. The PR is the primary sink; failure issues are secondary.

## Setup checklist (one-time)

- [x] The `plan-recon-bot` label already exists on the repo
      (`Failure issues from the monthly plan-recon cloud routine`).
      No `gh label create` call is needed; the prompt's failure path
      assumes the label is present.
- [ ] Set `ROUTINE_GH_LOGIN` in the routine's env to the GitHub login
      the routine actually posts as. Two common setups:
      - **PAT-driven cloud routine** (e.g. Anthropic Cloud routine
        running under your own Personal Access Token): set
        `ROUTINE_GH_LOGIN=<your-github-username>` (the PR + failure
        issue will appear authored by that human user with
        `user.type == "User"`).
      - **GitHub App / dedicated bot account**: set
        `ROUTINE_GH_LOGIN=<bot-login>` (e.g. `claude[bot]`).

      The prompt's
      [Skip check](./PROMPT.md#skip-check-run-at-the-start-of-every-run)
      uses this login as the trust boundary for accepting same-day
      duplicate-detection markers (the
      `<!-- plan-recon:<head-sha7>:archived -->` PR-body marker, and
      the failure-issue-title scan). The check deliberately does NOT
      constrain `user.type` — that would silently disable
      idempotency on PAT-based runs. It exits non-zero if the env var
      is unset, so a misconfigured run cannot accidentally trust
      markers from arbitrary users.
- [ ] Add `.plan-recon-cache/` to `.gitignore` (one line). The
      routine writes `pr-body-YYYY-MM-DD.md` and (on failure)
      `FAILED-issue-body-YYYY-MM-DD-<sha7>.md` there.
- [ ] Verify the routine's GitHub token scopes:
      - `pull-requests:write` (open the archive PR, comment).
      - `issues:write` (open the failure issue).
      - `contents:write` for the recon branch push only — the
        routine NEVER pushes to `develop`, `main`, or `demo`. The
        push target is always `docs/plan-recon-YYYY-MM-DD`.
- [ ] Dry-run once with `DRY_RUN=1` set in the routine's env. The
      prompt's [Dry-run mode](./PROMPT.md#dry-run-mode) section
      guards every `git mv`, `git push`, `gh pr create`,
      `gh issue create`, and `gh issue comment` call behind a
      `DRY_RUN` check; in dry-run mode each is replaced by a stdout
      dump of the would-be call + body. `npm run verify` still runs
      against the staged-but-uncommitted moves so verify-pass /
      verify-fail signals are realistic.

## Routine wrapper prompt (paste into the routine)

The routine itself only needs a tiny wrapper that points at this file
and lets the system prompt do the heavy lifting. Paste this exact
text into the routine's `events[].data.message.content` (one user
message):

> You are running the scheduled `plan-recon-bot` routine for the
> `agentonomous` repo.
>
> Steps:
>
> 1. Clone / refresh the repo and reason against `origin/develop`:
>    `git fetch origin && git switch develop && git pull --ff-only origin develop`.
>    The shipped-state source of truth is `git log origin/develop`,
>    not local `develop`.
> 2. Read the system prompt at `docs/plan-recon-bot/PROMPT.md` and
>    follow it verbatim. That file is the source of truth for what
>    to archive, the cross-checks, hard rules, output format,
>    persistence, dry-run mode, and failure handling. Do not
>    re-derive any of that from this message.
> 3. After deciding (a) leave-alone for every plan and exiting
>    cleanly with no PR / no issue, OR (b) opening the archive PR,
>    OR (c) opening a failure issue per the prompt — exit cleanly.
>    Do NOT push to `develop`, `main`, or `demo`. Do NOT edit any
>    code.
>
> If `docs/plan-recon-bot/PROMPT.md` does not exist on
> `origin/develop` for some reason, abort with a clear error — do
> not improvise an archive policy without the prompt.

That wrapper is intentionally short. The system prompt is versioned
in-repo so changes go through PR review like any other doc change —
the routine itself doesn't need to be re-edited every time the
prompt evolves.

## Cadence

Recommended: **monthly**, a few minutes off `:00` to avoid colliding
with hourly cron traffic. A reasonable cron in UTC:

- `13 9 1 * *` — first of every month, 09:13 UTC (10:13 / 11:13
  Europe/Berlin depending on DST).

### Why monthly, not weekly

Plans are coarse-grained surfaces. Most weeks zero new plans
complete; every roadmap row that ticks `[x]` does so via a PR that
also lands the work, so the "plan is now done" signal arrives in
batches around chunk-PR merge waves rather than continuously.

A weekly cadence would mostly produce no-ops (per the
[quiet-runs convention](#output-sink) the routine wouldn't open
anything, but the routine would still spin up infra and read the
plan tree four times for every meaningful archive). Monthly aligns
better with how often roadmap rows complete in batches and with
the 14-day quiet-period hard rule (see
[PROMPT.md → Hard rules](./PROMPT.md#hard-rules)) which already
defers archiving by two weeks regardless.

If a chunk-merge wave clearly finished a plan and the owner wants
the archive immediately, run the routine on demand rather than
waiting for the monthly cron — the same prompt and dry-run guards
apply.

## Iteration workflow (changing the prompt)

The prompt evolves as you discover false positives, missed hard
rules, or output-format pain. To change it:

1. Cut a topic branch from `develop`
   (`docs/plan-recon-prompt-tweak` or similar).
2. Edit [`PROMPT.md`](./PROMPT.md). Keep section structure stable so
   the routine doesn't break on a missing header.
3. Open a PR against `develop`. Doc-only diff → CI short-circuits
   to `ci-gate` only (~1 minute).
4. After merge, the next scheduled run picks up the new prompt.

## Known tradeoffs

- **False-archive risk on long-running plans with stale-but-incomplete
  rows.** A plan with one outstanding `[ ]` that the team has
  silently abandoned could in principle be archived if the row's
  status text is ambiguous. Mitigation: the 14-day quiet-period
  hard rule (see [PROMPT.md → Hard rules](./PROMPT.md#hard-rules))
  forces a fortnight of inactivity before the routine even
  considers archiving. If a row is genuinely stuck, the
  `docs-review-bot` routine flags it as drift on its weekly run
  before plan-recon-bot ever sees it as a candidate.
- **Monthly cadence means delayed archive of just-finished plans.**
  When a chunk-merge wave finishes a plan in week 1 of a month, the
  archive doesn't ship until day 1 of the next month. That's
  acceptable — the plan stays in `docs/plans/` for at most ~30 days
  past completion, the umbrella tracker issue still flips its row
  on chunk-PR merge, and an on-demand run can short-circuit the
  wait.
- **Tracker-issue parsing is heuristic.** The routine searches the
  plan body for `Tracks: #NNN` / `Issue #NNN` / `tracker.*#NNN`. If
  a plan uses an unusual phrasing, the prompt falls through to the
  ambiguous-flag path and the owner decides. That's the intended
  failure mode — never a silent skip.
- **The bot doesn't fix anything beyond moving files.** It will
  not rewrite stale links to archived plans elsewhere in the repo;
  if `npm run verify` catches a broken link, the run aborts and the
  failure issue tells the owner. Link rewrites belong in their own
  follow-up PR.
- **Successor-supersession requires explicit markers.** The prompt
  looks for `Superseded by` / `Replaces` / `Successor:` in the
  plan body. An implicit "this newer plan covers the same scope"
  inference is out of scope; flag it in the ambiguous section
  instead.

## Bot label convention

Each scheduled cloud routine in this repo owns a dedicated GitHub
label so its issues group cleanly under one filter:

| Routine                  | Label             |
| ------------------------ | ----------------- |
| `docs/review-bot/`       | `review-bot`      |
| `docs/docs-review-bot/`  | `docs-review`     |
| `docs/dep-triage-bot/`   | `dep-triage-bot`  |
| `docs/plan-recon-bot/`   | `plan-recon-bot`  |

Each per-run issue carries exactly its routine's label — no
cross-labelling, no shared `automation` umbrella label. Filter the
issue list by label to see one routine's full history.

For `plan-recon-bot` specifically, the label-tagged surface covers
**two distinct issue types** (the archive PR is filterable separately
by title pattern + base branch):

| Issue type | Title prefix | Marker | Meaning |
| ---------- | ------------ | ------ | ------- |
| Failure issue | `Plan reconciliation YYYY-MM-DD — <head-sha7>` | `<!-- plan-recon:<head-sha7>:failed -->` | Run aborted on `git mv` / `verify` / `push` / `pr-open`. Investigate. |
| Ambiguous-only triage issue | `Ambiguous plan candidates YYYY-MM-DD — <head-sha7>` | `<!-- plan-recon:<head-sha7>:ambiguous-only -->` | Run completed cleanly, zero archive moves but ≥1 ambiguous flag. Owner triage. |

An empty `plan-recon-bot` label view means the routine has not
surfaced anything for owner attention recently — neither failure
nor ambiguous candidates. Triage the label by reading the title /
marker before assuming "issue here = failure".

## Related

- Sibling routines: `docs/review-bot/` (daily code review of
  `develop` commits), `docs/docs-review-bot/` (weekly docs-drift
  audit), `docs/dep-triage-bot/` (weekly Dependabot triage).
- Archive folder for retired plans + specs: `docs/archive/`
  (`docs/archive/README.md` describes the archive convention this
  routine implements — preserve the date prefix, use `git mv`,
  prepend the archived banner).
- Branch / changeset / verify policy that the prompt's hard rules
  reference: `CLAUDE.md`, `CONTRIBUTING.md`, `STYLE_GUIDE.md`.
- Umbrella tracker for the quality-automation increment that
  introduced this routine: [Issue #131](https://github.com/Luis85/agentonomous/issues/131).
