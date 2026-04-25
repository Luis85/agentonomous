---
name: Worktrees required for feature work
description: Every topic branch lives in `.worktrees/<branch>`; the main checkout stays on `develop` so parallel agents can each run their own install / test / dev server.
type: feedback
---

All feature / refactor / chore work happens in a `git worktree` under
`.worktrees/<branch-slug>`. The main checkout stays on `develop` and
is never edited directly outside of post-merge pulls.

**Why:** Multiple parallel coding agents need to run simultaneously
without colliding on `node_modules`, Vite caches, `dist/` output, or
Vitest worker state. Each worktree gets its own isolated install +
dev server. `CLAUDE.md` codifies this rule under
"Non-negotiables → Worktrees per topic branch". `.worktrees/` is
already gitignored.

**How to apply:**

1. Cut every topic branch via:
   ```bash
   git worktree add .worktrees/<slug> -b <slug> origin/develop
   ```
   Never `git switch -c` in the main checkout.
2. `cd` into the worktree, then `npm ci` (or `npm install` on a warm
   cache) before any TDD work.
3. The verify gate (`npm run verify`) runs **inside** the worktree.
4. After the PR merges:
   ```bash
   git worktree remove .worktrees/<slug>
   git branch -d <slug>          # from the main checkout
   git worktree prune            # clear stale entries if needed
   ```
5. When dispatching parallel agents, give each agent its own worktree
   path so they can all run `npm test` / `npm run demo:dev`
   concurrently without contention.
