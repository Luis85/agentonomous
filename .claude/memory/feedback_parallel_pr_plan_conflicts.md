---
name: Parallel PRs in same wave will conflict on the plan-shipped table — merge-not-rebase
description: When dispatching N parallel topic-branch PRs that all mark themselves shipped in docs/plans/*.md, plan on resolving N-1 trivial conflicts via `git merge origin/develop` (preserves Codex review anchors)
type: feedback
originSessionId: 97567988-a027-4521-a75a-dcd260ce4d8e
---

Every parallel-wave PR in this repo marks its row shipped in the same `docs/plans/YYYY-MM-DD-*.md` "What's already shipped" table. The first to merge cleanly establishes a new line; every subsequent PR in the wave gets a one-line conflict on that table. Confirmed twice in session 2026-04-25 (waves 1 and 2 — 4 PRs, 2 conflicts each wave).

**Resolution pattern (in the topic-branch worktree):**

```bash
git fetch origin
git merge origin/develop --no-edit  # NOT rebase — line-anchor preservation matters for ongoing Codex review
# resolve plan-table conflict by ordering rows numerically + filling in just-merged PR numbers
git add docs/plans/<plan>.md
npm run verify
git commit --no-edit
git push origin <topic>
```

**Why merge instead of rebase:** Codex re-review anchors live on commit SHAs. Rebasing rewrites every commit on the topic branch and loses Codex's prior "👍 / no major issues" state — forcing a fresh round of review and resolving threads on the new SHAs. Merging adds one merge commit but keeps every prior commit's SHA and every prior Codex thread intact.

**How to apply:**

- When kicking off a parallel wave, _expect_ plan-conflict resolution as a step in the per-PR workflow; don't be surprised when the user says "we have merge conflicts on the open PRs" mid-wave.
- After the first PR in a wave merges, proactively `git merge origin/develop` into each remaining topic-branch worktree (don't wait for the user to flag the conflict).
- For the dispatched parallel agents themselves, include a "heads up: expect a 1-line plan-table conflict on merge; resolve via `git merge origin/develop`" note in their prompt so they don't try to rebase or force-push.
