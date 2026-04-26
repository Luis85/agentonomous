# `dep-triage-bot/` — weekly Dependabot triage routine

Source files for the scheduled remote agent that drains the weekly
Dependabot PR pile on `develop`. Once Dependabot's grouped PRs land
(per the `npm-non-major` group blocks in
[`.github/dependabot.yml`](../../.github/dependabot.yml)), this
routine runs every Monday morning, classifies each PR, runs the
`npm run verify` gate, and either auto-merges (dev-deps minor/patch),
leaves an approval comment for the owner (runtime minor/patch), or
blocks with an explanatory comment (majors, peer-deps, verify
failures).

Sibling of `docs/review-bot/` and `docs/docs-review-bot/` — same
skeleton, different target. Where `review-bot/` reviews **code
commits** and `docs-review-bot/` reviews **docs drift**, this
routine drains the **Dependabot PR pile**.

## Layout

| File                          | Purpose                                                  |
| ----------------------------- | -------------------------------------------------------- |
| [`PROMPT.md`](./PROMPT.md)    | System prompt the routine loads at the start of each run. |
| [`README.md`](./README.md)    | This file — routine setup, sinks, iteration workflow.   |

## Output sink

**One fresh issue per run.** Title `Dependency triage — YYYY-MM-DD`,
label `dep-triage-bot`. The issue **body** holds the full per-run
output: action counts, per-PR table, run footer. There is no rolling
tracker; each run's issue is a self-contained punch list the owner
closes manually once every blocked / major / approval-only row is
resolved.

Same pattern as the refactored daily `review-bot` (issue per run,
body holds findings) and `docs-review-bot` (issue per run, body
holds drift checklist) — long-lived per-run archives, no append-to-
shared-tracker step.

Per-PR triage state lives on the **Dependabot PR itself** as an HTML
comment marker `<!-- dep-triaged:<head-sha7>:<action> -->` embedded
at the top of the routine's per-PR comment body. The routine reads
that marker on the next run to skip already-triaged PRs unless their
head SHA has changed (e.g. via `@dependabot rebase`). See the
prompt's [Idempotency](./PROMPT.md#idempotency) section for the
exact skip-check shell snippet.

If a run finds zero open Dependabot PRs, the routine does NOT open
an issue. Quiet runs leave no trace — same convention as the daily
code-review bot.

## Setup checklist (one-time)

- [ ] Add the `dep-triage-bot` label to the repo:
      ```bash
      gh label create dep-triage-bot --color FBCA04 \
        --description "Findings from the weekly dep-triage cloud routine"
      ```
      (The prompt re-creates the label on first run if missing —
      this just avoids the create call racing with the issue-open
      call.)
- [ ] Add `.dep-triage-cache/` to `.gitignore` (one line). The
      routine writes a FAILED-issue-body file there if `gh issue
      create` fails so you can re-submit by hand.
- [ ] Enable auto-merge on the repo
      (`Settings → General → Pull Requests → Allow auto-merge`). The
      routine uses `gh pr merge --auto --squash` for the dev-deps
      minor/patch path. Without this, the routine falls back to
      approval-comment for every PR (still safe, just slower drain).
- [ ] Verify the routine has the right GitHub token scopes:
      `pull-requests:write` (comment, merge --auto, label),
      `issues:write` (open per-run issue, edit on same-date
      delta-append), and `contents:read` (clone + checkout PR
      branches). No `contents:write` — the routine never pushes a
      branch.
- [ ] Confirm Dependabot is configured to group npm minor + patch
      updates per the `npm-non-major` blocks on both npm entries in
      [`.github/dependabot.yml`](../../.github/dependabot.yml).
      Without grouping, the queue is N PRs/week instead of one
      tractable bundle and the routine's auto-merge cadence loses
      most of its value.
- [ ] Dry-run once with `DRY_RUN=1` set in the routine's env. The
      prompt's Dry-run section guards every `gh pr merge`,
      `gh pr comment`, `gh issue create`, `gh issue edit`, and
      `gh label create` call behind a `DRY_RUN` check; in dry-run
      mode each is replaced by a stdout dump of the would-be call +
      body. The `npm ci && npm run verify` step still runs locally
      so verify-pass / verify-fail signals are realistic.

## Routine wrapper prompt (paste into the routine)

The routine itself only needs a tiny wrapper that points at this
file and lets the system prompt do the heavy lifting. Paste this
exact text into the routine's `events[].data.message.content` (one
user message):

> You are running the scheduled `dep-triage-bot` routine for the
> `agentonomous` repo.
>
> Steps:
>
> 1. Clone / refresh the repo on `develop`:
>    `git fetch origin && git switch develop && git pull --ff-only origin develop`
> 2. Read the system prompt at `docs/dep-triage-bot/PROMPT.md` and
>    follow it verbatim. That file is the source of truth for what
>    to triage, the action policy table, hard rules, output format,
>    persistence, and dry-run rules. Do not re-derive any of that
>    from this message.
> 3. After draining the queue and opening the per-run
>    `dep-triage-bot` issue (or recognizing a no-op run with zero
>    open Dependabot PRs and exiting cleanly without opening an
>    issue), exit cleanly. Do NOT open a PR. Do NOT push to any
>    branch. Do NOT edit any code, manifests, or lockfiles directly.
>
> If `docs/dep-triage-bot/PROMPT.md` does not exist on `develop` for
> some reason, abort with a clear error — do not improvise a triage
> policy without the prompt.

That wrapper is intentionally short. The system prompt is versioned
in-repo so changes go through PR review like any other doc change —
the routine itself doesn't need to be re-edited every time the
prompt evolves.

## Cadence

Recommended: **weekly, Monday morning**, after Dependabot has opened
its grouped weekly PRs (Dependabot itself runs at 06:00 UTC Monday
per [`.github/dependabot.yml`](../../.github/dependabot.yml)). A
reasonable cron in UTC:

- `0 8 * * 1` — every Monday at 08:00 UTC (10:00 Europe/Berlin), one
  hour after Dependabot fires. Gives Dependabot time to actually
  finish opening PRs before the routine scans for them.

The routine no-ops cleanly when there are no open Dependabot PRs:
no issue is opened, no marker comment is left, no PR is touched. If
the queue stays empty for several weeks (Dependabot finds nothing
to bump), the `dep-triage-bot` label view simply shows nothing new
landing — that's the desired silence.

## Iteration workflow (changing the prompt)

The prompt evolves as you discover false positives, missed hard
rules, or output-format pain. To change it:

1. Cut a topic branch from `develop`
   (`docs/dep-triage-prompt-tweak` or similar).
2. Edit [`PROMPT.md`](./PROMPT.md). Keep section structure stable so
   the routine doesn't break on a missing header.
3. Open a PR against `develop`. Doc-only diff → CI short-circuits
   to `ci-gate` only (~1 minute).
4. After merge, the next scheduled run picks up the new prompt.

## Known tradeoffs

- **Auto-merge is conservative on purpose.** Only dev-deps minor/
  patch auto-merges; everything else waits for owner approval. If
  you find the queue still piling up because grouped PRs always
  contain at least one runtime bump (so the whole group inherits
  "runtime minor" → approval-comment), consider splitting npm into
  two ecosystem entries per
  [Dependabot grouping docs](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file#groups)
  — one runtime, one dev — so the dev-only group can auto-merge
  cleanly. Don't relax the policy.
- **`@dependabot rebase` is asynchronous.** The routine triggers a
  rebase via comment, then has to wait for Dependabot's bot to
  actually push the rebased commit. If Dependabot is slow or rate-
  limited, the routine may need to defer that PR to next week's run.
  That's logged as `awaiting Dependabot rebase` in the per-PR table
  notes — not a bug.
- **Major bumps never auto-merge.** Even on dev-deps. The bot only
  posts a changelog summary + breaking-change bullets and leaves the
  PR open. The owner reviews and merges (or closes) the major PR
  manually.
- **Group-PRs inherit the strictest classification.** Dependabot's
  `npm-non-major` group bundles runtime + dev minors into one PR.
  The routine treats the whole bundle as runtime-minor → approval-
  comment, no auto-merge. This is a deliberate safety bias; see the
  prompt's [Triage policy](./PROMPT.md#triage-policy).
- **Verify failures block silently from a CI perspective.** A
  blocked PR sits open with a comment; nothing flags the queue
  health. Mitigation: every per-run issue's footer reports
  `Blocked: N` — non-zero N is the signal to triage manually. The
  `dep-triage-bot` label view groups every run's issues so the
  backlog is one click away.
- **Issue list grows over time.** Each run opens an issue. Close
  each issue once every blocked / major / approval-only row it
  carries is resolved. Closed issues drop out of the
  `dep-triage-bot` label view automatically.

## Bot label convention

Each scheduled cloud routine in this repo owns a dedicated GitHub
label so its issues group cleanly under one filter:

| Routine                  | Label             |
| ------------------------ | ----------------- |
| `docs/review-bot/`       | `review-bot`      |
| `docs/docs-review-bot/`  | `docs-review`     |
| `docs/dep-triage-bot/`   | `dep-triage-bot`  |

Each per-run issue carries exactly its routine's label — no
cross-labelling, no shared `automation` umbrella label. Filter the
issue list by label to see one routine's full history.

## Related

- Sibling routines: `docs/review-bot/` (daily code review of
  `develop` commits, dual sink: per-run issue + committed daily
  docs), `docs/docs-review-bot/` (weekly docs-drift audit, fresh
  issue per run).
- Dependabot config: [`.github/dependabot.yml`](../../.github/dependabot.yml)
  — the `npm-non-major` group blocks are what make this routine
  tractable. Without grouping, the queue is N PRs/week.
- Branch / changeset / verify policy that the prompt's hard rules
  reference: `CLAUDE.md`, `CONTRIBUTING.md`, `STYLE_GUIDE.md`.
- Umbrella tracker for the quality-automation increment that
  introduced this routine: [Issue #131](https://github.com/Luis85/agentonomous/issues/131).
