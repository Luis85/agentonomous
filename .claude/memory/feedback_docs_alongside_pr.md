---
name: Update plan and docs alongside the PR that touches them
description: Whenever a PR completes a planned row or changes user-facing behavior, the plan markdown + relevant docs must update inside the same PR — not in a follow-up.
type: feedback
---

Every PR that lands roadmap work or changes behavior must bundle the
plan/doc updates into the same PR. No follow-up "docs catch-up" PRs.

**Why:** Splitting plan updates from the work that completed them
leaves `docs/plans/...md` stale and forces a second review cycle for
something that was trivially obvious from the diff. Stale plans also
make Codex less useful — it cross-references the plan when reviewing
and degrades when the plan disagrees with the diff.

**How to apply:**

- When implementing a row from `docs/plans/YYYY-MM-DD-<slug>.md`, edit
  the plan in the same PR — mark the row "Shipped (PR #N)" or move it
  under a "What's already shipped" heading.
- **Tracker-table flips ride with the same PR.** Don't land work with
  the row at "in review" and chase it with a one-line `docs: flip row
to ✅` follow-up — that pollutes git history. Instead: open the PR
  (the GH-assigned number is known immediately), edit the planning doc
  to set the row to `✅ shipped` with `[#NNN](url)` linked, push the
  same branch, then squash-merge. The row briefly reads "shipped" while
  the PR is still open; that is fine — it reflects intent and CI gates
  prevent a broken merge from leaving the row stale.
- When a PR changes user-visible surface (new option on a public
  helper, new event on the agent bus, new public type, new export),
  update the relevant doc (`README.md`, `STYLE_GUIDE.md`,
  `PUBLISHING.md`, the matching `docs/specs/...md`) in the same diff.
- When a PR introduces a new convention or non-obvious workflow, add
  a one-paragraph note to `CONTRIBUTING.md` or `CLAUDE.md`.
- Pure refactor / chore PRs that don't change a roadmap row or public
  surface can skip plan/doc updates.

If unsure whether the plan needs an update, default to updating it —
it's cheap, and a stale roadmap costs a future-session round-trip.
