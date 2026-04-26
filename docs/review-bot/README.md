# `review-bot/` — daily code-review routine

Source files for the scheduled remote agent that reviews `develop` once
per weekday and persists findings to two sinks.

## Layout

| File                          | Purpose                                                  |
| ----------------------------- | -------------------------------------------------------- |
| [`PROMPT.md`](./PROMPT.md)    | System prompt the routine loads at the start of each run. |
| [`README.md`](./README.md)    | This file — routine setup, sinks, iteration workflow.    |

## Output sinks

1. **Rolling GitHub issue** — title `Daily code review — develop`,
   label `review-bot`. New comment per run. Issue body holds the
   canonical `Last reviewed SHA` so the next run knows where to
   resume.
2. **Committed daily docs** — `docs/daily-reviews/YYYY-MM-DD.md`
   (one file per UTC day, frontmatter + findings body). Reaches
   `develop` via an automated PR `chore/daily-review-YYYY-MM-DD`,
   never a direct push.

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

IDs do not deduplicate across reruns: tomorrow's run on a new SHA
emits a fresh set of IDs even for findings that were already
unshipped. The unshipped checkbox on the prior comment still flips
when the eventual PR ships.

### Workflow

```text
gh issue view 87 --comments       # find a finding ID
/review-fix pick <id>             # creates worktree + plan
/superpowers:writing-plans <plan> # expand plan into chunked tasks
/superpowers:executing-plans …    # implement, verify, open PR
```

The PR body MUST contain, on its own line:

```
Refs #87 finding:<sha7>.<idx>
```

Trailing whitespace is tolerated; trailing punctuation breaks the
match. The PR body MUST NOT contain `Closes #87` / `Fixes #87` —
the tracker is long-lived and stays open.

### Auto-flip on merge

`.github/workflows/review-fix-shipped.yml` triggers on
`pull_request: closed && merged`, regexes the PR body for the magic
line, locates the matching tracker comment, and edits the body so
the checklist item becomes:

```markdown
- [x] **[BLOCKER]** `path/to/file.ts:42` — short title (shipped in #N) <!-- f:<sha7>.<idx> -->
```

The Action does not block merges; it observes them. If the magic
line is missing, it logs and exits 0.

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

- [ ] Create the rolling issue `Daily code review — develop`. Add label
      `review-bot`. Seed the body with `Last reviewed SHA: <none>` so
      the first run falls back to `--since="24 hours ago"`.
- [ ] Add a PR label `review-bot` (cosmetic — lets you filter the
      automated PRs out of the human review queue).
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

- **Rolling issue grows forever.** Rotate quarterly: close the current
  issue, open `Daily code review — develop (QN YYYY)`. Add a step to the
  routine that opens a new issue once the active one passes 500
  comments.
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
