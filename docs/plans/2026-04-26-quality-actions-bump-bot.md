# Quality automation — Action SHA bump cloud routine

> **Tracks:** [#130](https://github.com/Luis85/agentonomous/pull/130)
> (umbrella) · row 3 of
> [`2026-04-26-quality-automation-routines.md`](./2026-04-26-quality-automation-routines.md)
>
> **Branch (this row):** cut a fresh worktree off `origin/develop` —
> e.g. `docs/actions-bump-bot` under `.worktrees/docs-actions-bump-bot`.

**Goal:** Add a weekly cloud-routine prompt + README scaffold that
runs `scripts/bump-actions.mjs` and opens a PR with any pending
action SHA bumps.

## Files

- Create: `docs/actions-bump-bot/PROMPT.md`
- Create: `docs/actions-bump-bot/README.md`

## Steps

- [ ] **Step 1: Confirm `scripts/bump-actions.mjs` works**

```bash
node scripts/bump-actions.mjs
```

Expected: prints any pending bumps (or "no drift") without writing
files. Capture the exact output shape — the prompt has to instruct
the agent how to parse it.

- [ ] **Step 2: Write `docs/actions-bump-bot/PROMPT.md`**

Mirror the dep-triage prompt structure (`docs/dep-triage-bot/PROMPT.md`,
once it lands; otherwise mirror `docs/docs-review-bot/PROMPT.md`).
Key sections:

1. **Role** — "Action SHA-bump caretaker. Single job: keep
   `.github/workflows/*.yml` action references at their latest
   tags-as-SHA."
2. **Scope this run** — "Run weekly. Inputs come from
   `node scripts/bump-actions.mjs`."
3. **Process** — branch off `develop`
   (`chore/actions-bump-YYYY-MM-DD`), apply each bump, verify
   `actionlint` clean, run `npm run verify`, open one PR with the
   diff. Owner reviews and merges.
4. **Hard rules** — never bump across a major (require explicit
   owner approval); never edit the SHA without re-resolving via the
   peel-aware `tagToCommitSha` helper in `scripts/bump-actions.mjs`
   (or the umbrella's
   [`resolve_action_sha` helper](./2026-04-26-quality-automation-routines.md#resolve-an-action-tag--commit-sha-peel-aware-helper));
   never alter the trailing `# vX.Y.Z` comment without matching the
   bumped tag.
5. **Output** — single PR per run, body lists each `(action, old SHA,
   new SHA, version label)`. No-op runs: post a one-line comment on
   the tracker issue `Action SHA bumps — develop` and exit.
6. **Failure handling** — verify fails → close branch, comment on
   tracker.

- [ ] **Step 3: Write `docs/actions-bump-bot/README.md`**

Same shape as `docs/docs-review-bot/README.md`: how the routine
consumes the prompt, where output lives, how to evolve.

- [ ] **Step 4: Verify**

```bash
npm run verify
```

- [ ] **Step 5: Commit + push + open PR**

```bash
git add docs/actions-bump-bot/
git commit -m "docs(routine): add weekly action-SHA bump prompt"
git push -u origin docs/actions-bump-bot
gh pr create --base develop \
  --title "docs(routine): add weekly action-SHA bump prompt" \
  --body "Tracks: #130

Adds the weekly action-SHA-bump cloud-routine prompt + README scaffold
under docs/actions-bump-bot/. The routine wraps the existing
scripts/bump-actions.mjs (which already peels annotated tags via
tagToCommitSha) into a weekly PR-opening workflow.

Ticks row 3 of the umbrella tracker."
```

- [ ] **Step 6: Tick tracker row 3 in the same PR (amend + force-with-lease)**

```diff
-| 3   | [quality-actions-bump-bot.md](./2026-04-26-quality-actions-bump-bot.md) | Cloud routine prompt that runs `scripts/bump-actions.mjs` weekly + opens a bump PR | weekly | no | - [ ] not started |
+| 3   | [quality-actions-bump-bot.md](./2026-04-26-quality-actions-bump-bot.md) | Cloud routine prompt that runs `scripts/bump-actions.mjs` weekly + opens a bump PR | weekly | no | - [x] shipped via #NNN |
```

## Acceptance criteria

- `docs/actions-bump-bot/{PROMPT.md,README.md}` exist on `develop`.
- Tracker row 3 is `[x]`.
- Cloud-cron scheduling configured by owner outside the repo once
  the prompt lands.
