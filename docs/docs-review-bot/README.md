# `docs-review-bot/` — scheduled docs-drift review routine

Source files for the scheduled remote agent that audits `develop`'s
prose (READMEs, plans, specs, contributor guides, memory files) for
drift against the actual codebase, then opens a dedicated GitHub issue
per run with findings as checkbox items.

Sibling of `docs/review-bot/` — same skeleton, different target.
Where `review-bot/` reviews **code commits**, this routine reviews
**docs as they sit on `develop` right now**.

## Layout

| File                          | Purpose                                                  |
| ----------------------------- | -------------------------------------------------------- |
| [`PROMPT.md`](./PROMPT.md)    | System prompt the routine loads at the start of each run. |
| [`README.md`](./README.md)    | This file — routine setup, sinks, iteration workflow.   |

## Output sink

**One fresh issue per run.** Title `Docs review — YYYY-MM-DD (<sha7>)`,
label `docs-review`. Body holds the full findings checklist + run footer.
The owner ticks checkboxes as fixes land and closes the issue when the
last item ships.

Rationale for "issue per run" (vs the rolling `#87` tracker the
code-review bot uses): doc drift is mostly self-contained and
closeable. A rolling tracker would balloon and obscure resolution
state. Each run's issue is a punch list with a clear "done" condition.

If a run finds zero drift, the routine does NOT open an empty issue —
it appends a one-line "clean run" note to the most recent open
`docs-review` issue (or logs and exits if none exists).

## Setup checklist (one-time)

- [ ] Add the `docs-review` label to the repo:
      ```bash
      gh label create docs-review --color BFD4F2 \
        --description "Findings from the scheduled docs-review routine"
      ```
      (The prompt re-creates it on first run if missing — this just
      avoids the create call racing with the issue-open call.)
- [ ] Add `.docs-review-cache/` to `.gitignore` (one line). The
      routine writes a per-run body file there on failure so you can
      re-submit by hand.
- [ ] Verify the routine's GitHub token scopes:
      `issues:write` (open issues, comment, label) and `contents:read`
      (clone + git ops). No write scope on `contents:` — the routine
      never pushes a branch.
- [ ] Dry-run once with `DRY_RUN=1` set in the routine's env. The
      prompt's Persistence section (see `PROMPT.md` → "Dry-run mode")
      guards every `gh issue create`, `gh issue comment`, and
      `gh label create` call behind a `DRY_RUN` check; in dry-run
      mode each is replaced by a stdout dump of the would-be call +
      body, and no `.docs-review-cache/FAILED-*.md` file is written.
      Read-only `gh issue list` / `gh api .../comments` calls still
      run.

## Routine wrapper prompt (paste into the routine)

The routine itself only needs a tiny wrapper that points at this file
and lets the system prompt do the heavy lifting. Paste this exact text
into the routine's `events[].data.message.content` (one user message):

> You are running the scheduled docs-review routine for the
> `agentonomous` repo.
>
> Steps:
>
> 1. Clone / refresh the repo on `develop`:
>    `git fetch origin && git switch develop && git pull --ff-only origin develop`
> 2. Read the system prompt at `docs/docs-review-bot/PROMPT.md` and
>    follow it verbatim. That file is the source of truth for what
>    to flag, the severity rubric, output format, and persistence
>    rules. Do not re-derive any of that from this message.
> 3. After running the audit and opening (or commenting on) the
>    `docs-review` issue per the prompt's persistence section, exit
>    cleanly. Do NOT open a PR. Do NOT push to any branch. Do NOT
>    edit any docs directly.
>
> If `docs/docs-review-bot/PROMPT.md` does not exist on `develop` for
> some reason, abort with a clear error — do not improvise a review
> without the prompt.

That wrapper is intentionally short. The system prompt is versioned
in-repo so changes go through PR review like any other doc change —
the routine itself doesn't need to be re-edited every time the prompt
evolves.

## Cadence

Recommended: **weekly, Monday morning**. Doc drift is slow; daily would
be noisy. A reasonable cron in UTC:

- `0 7 * * 1` — every Monday at 07:00 UTC (09:00 Europe/Berlin).

If the project gets quiet for a stretch, the routine will mostly emit
clean runs (one-line comments on the prior issue). That's fine —
silence is the desired state. If activity ramps back up after a long
gap, switch to weekdays for a sprint, then drop back to weekly.

## Iteration workflow (changing the prompt)

The prompt evolves as you discover false positives, missed categories,
or output-format pain. To change it:

1. Cut a topic branch from `develop`
   (`docs/docs-review-prompt-tweak` or similar).
2. Edit [`PROMPT.md`](./PROMPT.md). Keep section structure stable so
   the routine doesn't break on a missing header.
3. Open a PR against `develop`. Doc-only diff → CI short-circuits
   to `ci-gate` only (~1 minute).
4. After merge, the next scheduled run picks up the new prompt.

## Known tradeoffs

- **Issue-per-run can pile up if findings aren't worked.** Mitigation:
  the bot only opens a NEW issue when there is at least one finding
  AND no prior open issue covers the same `<head-sha>`. Stale issues
  on older SHAs accumulate visibly in the `docs-review` label view —
  treat that as the signal to triage.
- **Prose is fuzzier than code.** Expect more `unverified — ` prefixes
  than the daily code-review bot emits. The 40-finding cap exists to
  keep runs readable when the prompt over-fires.
- **The bot doesn't fix anything.** Findings are picked up manually
  (or via a future `docs-review-fix` skill mirroring `review-fix`).
  Don't expect auto-PRs.
- **Quantitative entries get re-flagged each run if not removed.**
  That's by design — the prompt prefers removal to update for stats
  that drift again every release. Tick the box and remove the prose;
  don't tick the box and patch the number.
- **Completed plans should be archived, not patched.** When the bot
  flags a plan whose rows have all shipped, prefer
  `git mv docs/plans/<file> docs/archive/<file>` + the one-line
  archived banner over keeping it in the active set. The
  `docs/archive/` folder skips review entirely so drift there is
  intentional, not a recurring finding.

## Related

- Sibling routine: `docs/review-bot/` (daily code review of `develop`
  commits, dual sink: rolling issue `#87` + committed daily docs).
- Archive folder for retired plans + specs: `docs/archive/`
  (`docs/archive/README.md` describes the archive convention the bot
  recommends as a fix for completed-plan findings).
- Skill that turns code-review findings into worktrees + plans:
  `.claude/skills/review-fix/SKILL.md`. A future `docs-review-fix`
  skill could do the equivalent for `docs-review` issues; not yet
  built.
- Branch / changeset / verify policy that the prompt's process gates
  reference: `CLAUDE.md`, `CONTRIBUTING.md`, `STYLE_GUIDE.md`.
