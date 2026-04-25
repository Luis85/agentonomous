# Project memory index

One-line pointers into `.claude/memory/`. Open each file for the full
reasoning. See [README.md](./README.md) for what belongs here.

## Project state

- [Codex reviews all PRs](project_codex_review.md) — every PR opened against `develop` / `main` is auto-reviewed by Codex; keep diffs small and self-contained.
- [1.0 release on hold](project_v1_release_hold.md) — major-bump changesets accumulate in `.changeset/` but no npm publish until library + demo polish is done.
- [Polish + harden roadmap](project_polish_harden_roadmap.md) — pointer to the active pre-1.0 plan in `docs/plans/`.
- [Graphify knowledge graph](project_graphify_usage.md) — read `graphify-out/GRAPH_REPORT.md` before architecture questions or non-trivial code reviews.

## Workflow rules

- [PR hygiene rules](feedback_pr_hygiene.md) — branch-per-concern, never stack, verify green pre-PR, no `--no-verify`.
- [PR workflow — independent + batch + multi-pass Codex](feedback_pr_workflow.md) — open all independent PRs first, then sweep Codex reviews PR by PR until 👍.
- [Pre-1.0 PRs skip migration layers](feedback_prerelease_no_migration.md) — no shipped consumers; clean-break shape changes, no compat shims.
- [Docs + plan updates ride with their PR](feedback_docs_alongside_pr.md) — every roadmap row or user-visible change updates the plan + relevant docs in the SAME PR.
- [Worktrees required for feature work](feedback_worktrees_required.md) — every topic branch lives in `.worktrees/<slug>`; main checkout stays on `develop` for parallel agents.
