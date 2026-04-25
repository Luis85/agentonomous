---
name: Polish + harden roadmap pointer
description: Active pre-1.0 polish + harden roadmap. Combines remediation, CI hardening, complexity ratchet, demo + library seams, tooling.
type: project
---

The active pre-1.0 roadmap lives in `docs/plans/`. The current entry
is `docs/plans/2026-04-25-comprehensive-polish-and-harden.md`, which
supersedes the earlier `2026-04-24-polish-and-harden.md` and
`2026-04-24-codebase-review-findings.md` (both kept in git history for
context).

If the comprehensive plan has been superseded by a newer entry, list
`docs/plans/` and pick the most recent file matching
`*polish*harden*.md`.

## Track summary

| Track                     | Purpose                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Already shipped (Track A) | Architectural ESLint guardrails, persistence/restore correctness fixes.                                                                   |
| 1 — CI hardening          | DRY release workflow, size-limit PR comment, npm audit gate, action SHA pinning, backend + OS matrix.                                     |
| 2 — Stale docs            | README pre-release banner, changeset baseBranch, JSDoc gaps.                                                                              |
| 3 — Complexity ratchet    | Cap cyclomatic complexity on outliers (createAgent, Agent.tick, restore, constructor); non-null assertion cleanup.                        |
| 4 — Demo + library seams  | Loss sparkline, epoch progress, LLM example, TfjsLearner wiring, multi-output softmax, richer features, prediction strip, backend picker. |
| 5 — Tooling               | Vitest coverage thresholds, peer dep pinning.                                                                                             |

## How to use

1. Read the current plan file before starting a session.
2. Pick the next row by the recommended sequencing inside the plan.
3. Follow the per-PR ritual in
   [`feedback_pr_workflow.md`](./feedback_pr_workflow.md) — independent
   branch per row, batch open, multi-pass Codex resolve, resolve threads,
   maintainer merges.
4. Update the plan in the same PR that lands the row (mark "Shipped
   (PR #N)" or move under "What's already shipped"). See
   [`feedback_docs_alongside_pr.md`](./feedback_docs_alongside_pr.md).

## Stop conditions

- Maintainer asks for the 1.0 publish — pause polish, switch to release
  prep.
- A row's "Depends on" column is unsatisfied — skip it, do the blocker
  first.
