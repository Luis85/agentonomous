---
name: Codex reviews all PRs
description: Codex (ChatGPT code-review bot) comments on every PR opened against this repo. Keep diffs small, self-contained, and Codex-friendly.
type: project
---

Every PR opened against `develop` (and `main`) is auto-reviewed by Codex
(OpenAI's ChatGPT code-review bot). Codex posts line-level comments plus
a summary; the maintainer triages them alongside their own review.

**Why:** Codex is a fixture of this repo's review pipeline, not a
one-off. Optimizing PR shape for it pays off on every change.

**How to apply:**

- **Small, focused PRs win.** Codex handles one concern at a time far
  better than a large mixed diff. One PR = one branch = one concern.
- **Stack-free branches.** Every topic branch is cut fresh from
  `develop`. Never stack PRs; Codex tries to re-review across the chain
  and the comments get noisy.
- **Self-contained commits.** Each commit body should explain the _why_
  (not just the _what_) — Codex cites them verbatim when summarising
  changes.
- **PR body matters.** Use the Summary + Test plan + Notes-for-review
  format. Codex reads these; structured notes reduce the "why did you
  do X?" round.
- **Expect a review round even on docs-only / XS fixes.** Codex
  comments on everything — don't be surprised by a 1-line PR getting 4
  comments.

**Workflow after opening a batch of PRs:**

1. Wait for Codex to post its review (usually within a few minutes of
   push).
2. Triage PR-by-PR: `gh pr view <num> --comments` (or
   `gh api repos/:owner/:repo/pulls/<num>/comments` for the
   line-level comments with their commit anchors).
3. Address concerns with follow-up commits on the same branch (a fresh
   push triggers a Codex re-review). **Don't rebase mid-review** — the
   comments lose their line anchors.
4. Resolve review threads only once the entire conversation is
   addressed.

See also: [`feedback_pr_workflow.md`](./feedback_pr_workflow.md) for
the full multi-PR sweep loop.
