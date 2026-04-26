---
name: PR hygiene rules for this repo
description: Branch-per-concern, never stack, verify green pre-PR, no --no-verify. Codex + maintainer review both rely on this shape.
type: feedback
---

- **Branch-per-concern.** Each topic branch from `develop` carries
  exactly one concern. Multiple concerns in one session = multiple
  branches, each cut fresh from `develop`. Never stack branches.
- **`npm run verify` green pre-PR.** Always. This is the
  non-negotiable gate codified in `CLAUDE.md`: format + lint +
  typecheck + test + build.
- **Never `--no-verify`.** If a pre-commit hook fails, fix the cause.
  CI rejects `--no-verify`'d commits anyway, and the harness denies
  the flag at the permission layer.
- **Maintainer merges.** Don't merge your own PRs. Open them and wait
  for maintainer + Codex review. Post-merge cleanup
  (`git switch develop && git pull && git branch -d <topic>`) happens
  on the maintainer's side; remote topic branches get deleted via the
  merged-PR UI.
- **`.bin` fragility on Windows.** If `npm run verify` reports
  `prettier not found` (or any other tool from `.bin`), `node_modules/.bin`
  is empty. Fix:
  ```bash
  rm -rf node_modules && npm install
  ```
  This regenerates the shims. Common after partial installs or
  cross-shell switches.

**Why:** Maintainer + Codex reviews both assume small, self-contained
PRs. Stacked branches confuse Codex's line anchors and force
cherry-pick during review. Unclean `verify` = CI failure = wasted
review round.

**How to apply:** When tackling a multi-step session, plan the branch
list up front, open each PR against `develop` (never against a
previous topic branch), and include the Codex-friendly Summary +
Test plan + Notes-for-review body sections.
