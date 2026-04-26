# Quality automation — Plan reconciliation cloud routine

> **Tracks:** [#130](https://github.com/Luis85/agentonomous/pull/130) (umbrella plan) · [#131](https://github.com/Luis85/agentonomous/issues/131) (durable issue tracker) · row 4 of
> [`2026-04-26-quality-automation-routines.md`](./2026-04-26-quality-automation-routines.md)
>
> **Branch (this row):** cut a fresh worktree off `origin/develop` —
> e.g. `docs/plan-recon-bot` under `.worktrees/docs-plan-recon-bot`.

**Goal:** Add a monthly cloud-routine prompt + README scaffold that
reconciles `docs/plans/*.md` against shipped state and archives plans
whose every roadmap row is shipped (or that are superseded).

**Why monthly, not weekly:** plans are coarse-grained; a weekly
cadence would mostly produce no-ops. Monthly aligns with how often
roadmap rows complete in batches.

## Distinction from existing routines

- **`docs/review-bot/`** = adversarial code review of recent commits
  on `develop`.
- **`docs/docs-review-bot/`** = audits prose across the repo for
  drift against the current code.
- **This routine** = answers a different question: "is this plan
  done?" Walks `docs/plans/*.md`, checks shipped state, `git mv`s
  finished plans into `docs/archive/plans/`.

## Files

- Create: `docs/plan-recon-bot/PROMPT.md`
- Create: `docs/plan-recon-bot/README.md`

## Steps

- [ ] **Step 1: Read the archive convention**

```bash
cat docs/archive/README.md
ls docs/archive/plans/
ls docs/plans/
```

Note: dates on archive entries are preserved; `git mv` keeps the
filename so links resolve via git history.

- [ ] **Step 2: Write `docs/plan-recon-bot/PROMPT.md`**

Sections:

1. **Role** — "Plan archivist. Reconcile `docs/plans/*.md` against
   shipped state. Different from docs-review-bot (which audits prose
   drift); this routine answers 'is this plan done?'"
2. **Scope this run** — every file under `docs/plans/`. For each:
   parse roadmap rows / tracker tables, cross-check
   `git log origin/develop` (and the umbrella tracker issue if
   linked) for shipped status, and either:
   - (a) leave alone if work continues,
   - (b) move to `docs/archive/plans/` via `git mv` if every row is
     shipped or the plan is superseded by a successor.
3. **Hard rules** — never delete plan content; only `git mv`.
   Preserve the date prefix. Never archive a plan that has open rows
   or whose tracker issue is still labelled `in-progress`.
4. **Output** — open one PR per run with archive moves, body lists
   each `(plan, last shipped row, archive reason)`. No moves needed:
   post a one-line comment on the tracker issue `Plan reconciliation`
   (label `plan-recon-bot`) and exit.
5. **Failure handling** — same pattern as the other routines (rolling
   issue, never push direct to `develop`, comment on failure).

- [ ] **Step 3: Write `docs/plan-recon-bot/README.md`**

- [ ] **Step 4: Verify**

```bash
npm run verify
```

- [ ] **Step 5: Commit + push + open PR**

```bash
git add docs/plan-recon-bot/
git commit -m "docs(routine): add monthly plan reconciliation prompt"
git push -u origin docs/plan-recon-bot
gh pr create --base develop \
  --title "docs(routine): add monthly plan reconciliation prompt" \
  --body "Tracks: #130
Tracks: #131

Adds the monthly plan-reconciliation cloud-routine prompt + README
scaffold under docs/plan-recon-bot/. Distinct from docs-review-bot
(which audits drift); this routine answers 'is this plan done?' and
archives finished plans via git mv.

Ticks row 4 of the umbrella tracker."
```

- [ ] **Step 6: Tick tracker row 4 in the same PR (amend + force-with-lease)**

```diff
-| 4   | [quality-plan-recon-bot.md](./2026-04-26-quality-plan-recon-bot.md) | Cloud routine prompt that archives shipped plans monthly | monthly | no | - [ ] not started |
+| 4   | [quality-plan-recon-bot.md](./2026-04-26-quality-plan-recon-bot.md) | Cloud routine prompt that archives shipped plans monthly | monthly | no | - [x] shipped via #NNN |
```

## Acceptance criteria

- `docs/plan-recon-bot/{PROMPT.md,README.md}` exist on `develop`.
- Tracker row 4 is `[x]`.
- Cloud-cron scheduling configured by owner outside the repo once
  the prompt lands.
