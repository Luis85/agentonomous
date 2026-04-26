---
name: Autonomous merge OK after Codex 👍
description: Owner pre-authorized self-merge of this repo's PRs once Codex approves and CI is green; overrides the "owner merges" default for this project.
type: feedback
---

Claude may self-merge this repo's PRs without asking, **provided
all of the following hold**:

1. Codex Review issue-level comment contains "Didn't find any major issues".
2. `gh pr checks <n>` shows every required check `pass` (no `pending`,
   no `fail`).
3. `gh pr view <n> --json mergeStateStatus` returns `CLEAN`.
4. The PR was opened in an autonomous run the user explicitly asked
   for (e.g. "/review-fix … autonomous mode", "ship these
   sequentially").

**Why:** owner said `2026-04-26` while running a `/review-fix` sweep:

> "you can merge those on your own once Codex gives thumbs up"
> This loosens the standing `feedback_pr_workflow.md` rule ("owner
> merges") for autonomous Claude-driven runs only. Manual / human-paced
> PRs still default to owner-merge.

**How to apply:**

- After Codex 👍 + CI green + `mergeStateStatus=CLEAN`, run
  `gh pr merge <n> --squash --delete-branch` (project switched to
  **squash-merge** post-PR #119; all PRs from #133 onward land as
  squash commits with title pattern `<type>: <subject> (#NNN)`. Trying
  `--merge` returns `enablePullRequestAutoMerge` GraphQL error). Use
  `--auto` if the head SHA is mid-CI run — GitHub will fire the merge
  once required checks pass.
- After local merge commit blocked on CI, the post-merge branch is
  squash-merged so the local topic branch will not be "fully merged"
  ancestor of `develop`. Use `git branch -D <topic>` (force) for
  cleanup, not `-d`.
- Then `git switch develop && git pull origin develop && git
worktree remove .worktrees/<slug> && git branch -D <topic>`.
- If Codex finds something or CI fails, do NOT merge — fix and
  re-trigger `@codex review`.
- If user is paired in real-time and watching, still default to
  asking before merging — this autonomy is for unattended runs.
