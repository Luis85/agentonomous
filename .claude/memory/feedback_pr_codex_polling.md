---
name: Auto-poll Codex reviews on PRs
description: After pushing to a PR + requesting Codex review, automatically arm a 5m cron poll loop without asking each time
type: feedback
originSessionId: 39908e5f-123e-46e0-8622-c0dde295e974
---

After every push to an open PR that triggers a Codex review (`@codex review`), automatically arm a `/loop 5m` cron poll that checks for findings/approval and stops itself when results land. Don't ask "want me to /loop?" each time — just do it.

**Why:** Owner asked explicitly on PR #104 (2026-04-25) to make this the default behavior whenever working with PRs to listen for code reviews. Manual prompting between rounds wastes a turn.

**How to apply:** After any `gh pr comment <N> --body "@codex review"` (or any push that re-triggers Codex on an open PR), invoke the `loop` skill with `5m check Codex review on PR #<N>; if findings posted, summarize and stop loop; if approved/clean, stop loop`. Stop the loop via `CronDelete` when the user types "review landed" / when findings come in / when CI flips green + Codex approves. Don't double-arm — call `CronList` first; if a Codex-poll cron already exists for the same PR, leave it.
