# `review-bot/` — daily code-review routine

Source files for the scheduled remote agent that reviews `develop` once
per weekday and persists findings to two sinks.

## Layout

| File                          | Purpose                                                  |
| ----------------------------- | -------------------------------------------------------- |
| [`PROMPT.md`](./PROMPT.md)    | System prompt the routine loads at the start of each run. |
| [`README.md`](./README.md)    | This file — routine setup, sinks, iteration workflow.    |

## Output sinks

1. **GitHub issue per run** — title
   `Code review YYYY-MM-DD — <head-sha[:7]>`, label `review-bot`.
   Each scheduled run opens a fresh issue whose **body** holds the
   full findings block. There is no rolling tracker and no
   append-to-comments step; the `review-fix-shipped` Action edits
   the body in place when individual findings ship.
2. **Committed daily docs** — `docs/daily-reviews/YYYY-MM-DD.md`
   (one file per UTC day, frontmatter + findings body, plus an
   `issue: <n>` cross-link). Reaches `develop` via an automated PR
   `chore/daily-review-YYYY-MM-DD`, never a direct push. The doc's
   `range:` end SHA is the canonical "Last reviewed SHA" the next
   run reads to resume.

## Ingesting findings via `review-fix`

The `.claude/skills/review-fix/SKILL.md` skill turns one finding into
a worktree-isolated topic branch + plan, ready for
`superpowers:writing-plans` → `superpowers:executing-plans`.

### Finding ID

Each finding the bot writes carries a stable ID
`<head-sha[:7]>.<idx>`, embedded as an HTML comment on its checklist
line. `head-sha[:7]` is the seven-char prefix of the head SHA
reviewed in that run; `idx` is the 1-based position of the finding
within the run.

IDs do not deduplicate across runs: tomorrow's run on a new SHA
emits a fresh set of IDs even for findings that were already
unshipped, and they live on a different issue. The unshipped
checkbox on the prior issue still flips when the eventual PR ships.

### Workflow

```text
gh issue list --label review-bot --state open --limit 5  # find the latest issue
gh issue view <n>                                        # read the body, pick a finding ID
/review-fix pick <id>                                    # creates worktree + plan
/superpowers:writing-plans <plan>                        # expand plan into chunked tasks
/superpowers:executing-plans …                           # implement, verify, open PR
```

The PR body MUST contain, on its own line:

```
Refs #<issue-number> finding:<sha7>.<idx>
```

`<issue-number>` is the review-bot issue that holds the matching
finding (the `review-fix` skill writes it into the plan
frontmatter). Trailing whitespace is tolerated; trailing
punctuation breaks the match. The PR body MUST NOT contain
`Closes #<n>` / `Fixes #<n>` for the review-bot issue — those
issues are long-lived archives of each run, even after every
finding ships.

### Auto-flip on merge

`.github/workflows/review-fix-shipped.yml` triggers on
`pull_request: closed && merged`, regexes the PR body for every
`Refs #<n> finding:<sha7>.<idx>` line, fetches each referenced
issue's body, and edits the matching checklist item in place:

```markdown
- [x] **[BLOCKER]** `path/to/file.ts:42` — short title (shipped in #N) <!-- f:<sha7>.<idx> -->
```

The Action does not block merges; it observes them. If the magic
line is missing or the referenced issue does not exist, it logs and
exits 0. Read failures (403/429/5xx) fail the run loudly so a
silently-dropped flip never goes unnoticed.

## CI behavior on the daily PR

`.github/workflows/ci.yml` short-circuits doc-only PRs:

- A `changes` job uses `dorny/paths-filter` to detect whether the diff
  touches code (`src/**`, `tests/**`, `examples/**`, configs, workflows)
  or only docs / changesets / markdown.
- Heavy jobs (`lint`, `typecheck`, `docs`, `test`, `build`,
  `size-limit-comment`, `demo-build`) are gated on
  `needs.changes.outputs.code == 'true'` and skip on doc-only diffs.
- Cheap always-on jobs (`format-check`, `actionlint`, `audit`) keep
  running so docs PRs still get prettier + supply-chain protection.
- A final `ci-gate` job aggregates all `needs` results, treating
  legitimately-skipped jobs as success. **Branch protection on
  `develop` should require only `ci-gate`.** The daily review PR
  finishes CI in ~1 minute on doc-only diffs vs ~6+ minutes on full
  verify.

## Iteration workflow

The prompt evolves as you discover new false positives, missing
invariants, or output-format pain. To change it:

1. Cut a topic branch from `develop` (`docs/review-bot-prompt-tweak` or
   similar).
2. Edit [`PROMPT.md`](./PROMPT.md). Keep the section structure stable so
   the routine doesn't break on a missing header.
3. Open a PR against `develop`. Doc-only → `ci-gate` only.
4. After merge, the next scheduled run picks up the new prompt.

## Initial setup checklist (one-time)

- [ ] Create the `review-bot` label (issue + PR scope). Issue scope
      lets the bot tag every per-run issue and lets `review-fix`
      query them with `gh issue list --label review-bot`. PR scope
      is cosmetic — filters automated review-fix PRs out of the
      human queue.
- [ ] Confirm the first run will fall back to
      `git log --since="24 hours ago"` because no
      `docs/daily-reviews/*.md` exists yet on `develop`. After the
      first run lands, the doc's `range:` end SHA becomes the
      resume point automatically.
- [ ] Enable auto-merge on the repo (`Settings → General → Pull
      Requests → Allow auto-merge`). The routine sets
      `gh pr merge --auto --squash`.
- [ ] Update branch protection on `develop`: require **only** `ci-gate`
      as the status check. Remove the per-job required checks if any
      were configured before this change.
- [ ] Verify the routine has the right GitHub token scopes:
      `contents:write` (push branch), `pull-requests:write` (open + auto-
      merge), `issues:write` (rolling issue comments). Read-only on
      everything else.
- [ ] Dry-run twice manually before scheduling. Set `DRY_RUN=1` in the
      routine's env to print intended commands without pushing or
      calling `gh`.
- [ ] Confirm the `review-fix-shipped` workflow file is present on
      `develop` (`.github/workflows/review-fix-shipped.yml`). It needs
      no extra setup; the default `GITHUB_TOKEN` has the required
      `issues:write` scope.

## Cadence

Weekdays only (Mon–Fri) at a fixed local hour. If commit volume on
`develop` is low, drop to Mon / Wed / Fri. The routine no-ops cleanly
when there are no new commits, so over-scheduling is not destructive —
just noisy in the rolling issue.

## Known tradeoffs

- **Issue list grows over time.** Each run opens an issue. Close
  each issue once every finding it carries has shipped — closed
  issues drop out of `review-fix`'s scope automatically. The
  `review-fix-shipped` Action does not auto-close; do it manually
  or wire a separate routine when the backlog warrants one.
- **Doc PR still costs CI minutes** for `format-check`, `actionlint`,
  `audit`, and `ci-gate`. Acceptable — combined under a minute.
- **Auto-merge requires green CI on `develop`'s protection rules.** If
  your protection rules require a CODEOWNERS approval, the routine's
  PRs sit until a human ack — defeats the daily cadence. Decide which
  matters more.

## Related

- Output dumps: `docs/daily-reviews/YYYY-MM-DD.md`
- CI workflow: `.github/workflows/ci.yml`
- Branch policy + workflow rules: `CLAUDE.md`, `CONTRIBUTING.md`
