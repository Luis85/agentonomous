# Quality automation — Dependabot triage cloud routine

> **Tracks:** [#130](https://github.com/Luis85/agentonomous/pull/130) (umbrella plan) · [#131](https://github.com/Luis85/agentonomous/issues/131) (durable issue tracker) · row 2 of
> [`2026-04-26-quality-automation-routines.md`](./2026-04-26-quality-automation-routines.md)
>
> **Branch (this row):** cut a fresh worktree off `origin/develop` —
> e.g. `docs/dep-triage-bot` under `.worktrees/docs-dep-triage-bot`.

**Goal:** Add a weekly cloud-routine prompt + README scaffold for
draining the Dependabot PR pile, plus update `.github/dependabot.yml`
to group npm minor + patch updates so the routine sees one tractable
PR per ecosystem-week instead of N.

## Files

- Create: `docs/dep-triage-bot/PROMPT.md`
- Create: `docs/dep-triage-bot/README.md`
- Modify: `.github/dependabot.yml` — group npm minor + patch updates

## Steps

- [ ] **Step 1: Read existing routine pattern**

```bash
cat docs/docs-review-bot/PROMPT.md   # use as structural template
cat docs/docs-review-bot/README.md
cat .github/dependabot.yml
```

The dep-triage routine MUST mirror the existing review-bot prose
conventions: one tracker issue per scheduled run (label
`dep-triage-bot`), findings/summary in the issue body, idempotency
via "last triaged SHA" persisted to a committed daily doc, never
push direct to develop.

- [ ] **Step 2: Update `.github/dependabot.yml`**

Add a `groups:` block on each `package-ecosystem: "npm"` entry so
minor + patch updates land in a single weekly PR rather than 5–10
separate ones.

```yaml
# Example shape — adapt to existing keys verbatim. Apply to BOTH the
# root `npm` entry and the `examples/nurture-pet` entry if both exist.
- package-ecosystem: "npm"
  directory: "/"
  schedule:
    interval: "weekly"
  groups:
    npm-non-major:
      patterns: ["*"]
      update-types: ["minor", "patch"]
```

- [ ] **Step 3: Write `docs/dep-triage-bot/PROMPT.md`**

Sections to include (mirror `docs/review-bot/PROMPT.md`):

1. **Role** — "Senior dependency triage. Conservative, not
   adventurous. Goal: drain the Dependabot pile without bricking the
   build."
2. **Scope this run** — "Open Dependabot PRs targeting `develop`,
   label `dependencies`."
3. **Triage policy** —
   - Patch + minor on **dev-deps**: rebase, run `npm run verify`,
     auto-merge if green.
   - Patch + minor on **runtime deps**: rebase, run verify, leave a
     one-line approval comment but do NOT merge (owner approval
     required).
   - **Major on anything**: comment with the changelog summary +
     breaking-change bullet list, leave for owner.
   - **Peer-deps**: never auto-merge.
4. **Hard rules** — never merge a PR that touches `src/**` (means
   Dependabot generated more than a manifest bump, suspicious);
   never bypass `--no-verify`; never amend the Dependabot commit.
5. **Output** — open one tracker issue per run titled
   `Dependency triage YYYY-MM-DD — <head-sha[:7]>` (label
   `dep-triage-bot`); the body holds that run's summary.
6. **Failure handling** — verify fails → comment "verify failed:
   \<err tail\>" on the Dependabot PR + create the tracker issue
   noting the failure, do NOT merge.

Use the same idempotency pattern as `docs/review-bot/PROMPT.md`
(one issue per run, body holds findings, last-triaged SHA lives in
the committed daily doc, never push direct to develop).

- [ ] **Step 4: Write `docs/dep-triage-bot/README.md`**

Mirror `docs/review-bot/README.md`: how the routine consumes the
prompt, where output lives (a fresh tracker issue per run), how to
evolve the prompt (edit on a topic branch, open a PR, next run
picks it up).

- [ ] **Step 5: Verify**

```bash
npm run verify
```

Expected: same pass set as `develop` HEAD (this is doc-only, so
nothing else moves).

- [ ] **Step 6: Commit + push + open PR**

```bash
git add docs/dep-triage-bot/ .github/dependabot.yml
git commit -m "docs(routine): add weekly Dependabot triage prompt"
git push -u origin docs/dep-triage-bot
gh pr create --base develop \
  --title "docs(routine): add weekly Dependabot triage prompt" \
  --body "Tracks: #130
Tracks: #131

Adds the weekly Dependabot triage cloud-routine prompt + README
scaffold under docs/dep-triage-bot/. Also groups npm minor+patch
updates in dependabot.yml so the routine sees one PR per ecosystem-
week instead of N.

Ticks row 2 of the umbrella tracker."
```

- [ ] **Step 7: Tick tracker row 2 in the same PR**

Amend the commit to also include the row-2 tick edit on
[`2026-04-26-quality-automation-routines.md`](./2026-04-26-quality-automation-routines.md):

```diff
-| 2   | [quality-dep-triage-bot.md](./2026-04-26-quality-dep-triage-bot.md) | Cloud routine prompt + `dependabot.yml` grouping for weekly Dependabot triage | weekly | no | - [ ] not started |
+| 2   | [quality-dep-triage-bot.md](./2026-04-26-quality-dep-triage-bot.md) | Cloud routine prompt + `dependabot.yml` grouping for weekly Dependabot triage | weekly | no | - [x] shipped via #NNN |
```

```bash
git add docs/plans/2026-04-26-quality-automation-routines.md
git commit --amend --no-edit
git push --force-with-lease
```

## Acceptance criteria

- `docs/dep-triage-bot/{PROMPT.md,README.md}` exist on `develop`.
- `.github/dependabot.yml` has a `groups:` block for npm minor+patch
  on every npm ecosystem entry.
- Tracker row 2 in the umbrella plan is `[x]`.
- The actual cloud-cron scheduling is configured outside the repo
  (Claude Cloud) by the owner once the prompt lands. Document that
  step in the PR body but do not gate merge on it.
