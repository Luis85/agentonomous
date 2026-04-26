# Project memory index

One-line pointers into `.claude/memory/`. Open each file for the full
reasoning. See [README.md](./README.md) for what belongs here.

## Project state

- [Codex reviews all PRs](project_codex_review.md) — every PR opened against `develop` / `main` is auto-reviewed by Codex; keep diffs small and self-contained.
- [1.0 release on hold](project_v1_release_hold.md) — major-bump changesets accumulate in `.changeset/` but no npm publish until library + demo polish is done.
- [Pending 1.0 breaking changesets](project_pending_major_changesets.md) — which PRs already carry major bumps queued for the eventual publish.
- [Polish + harden roadmap](project_polish_harden_roadmap.md) — pointer to the active pre-1.0 plan in `docs/plans/`.
- [Graphify knowledge graph](project_graphify_usage.md) — read `graphify-out/GRAPH_REPORT.md` before architecture questions or non-trivial code reviews.

## Workflow rules

- [PR hygiene rules](feedback_pr_hygiene.md) — branch-per-concern, never stack, verify green pre-PR, no `--no-verify`.
- [PR workflow — independent + batch + multi-pass Codex](feedback_pr_workflow.md) — open all independent PRs first, then sweep Codex reviews PR by PR until 👍.
- [Pre-1.0 PRs skip migration layers](feedback_prerelease_no_migration.md) — no shipped consumers; clean-break shape changes, no compat shims.
- [Docs + plan updates ride with their PR](feedback_docs_alongside_pr.md) — every roadmap row or user-visible change updates the plan + relevant docs in the SAME PR.
- [Worktrees required for feature work](feedback_worktrees_required.md) — every topic branch lives in `.worktrees/<slug>`; main checkout stays on `develop` for parallel agents.
- [Auto-poll Codex reviews](feedback_pr_codex_polling.md) — after every `@codex review` push, arm a 5m cron poll loop without asking; stop on findings/approval.
- [Codex signal endpoints](feedback_codex_signal_endpoints.md) — approval = `+1` reaction OR issue-level comment; findings = line-level P1/P2; `gh pr view --json reviews` misses all three signals.
- [Autonomous merge OK after Codex 👍](feedback_autonomous_merge_after_codex.md) — in autonomous Claude-driven runs, self-merge once Codex approves + CI green + mergeStateStatus CLEAN.
- [Parallel PRs hit plan-table conflicts](feedback_parallel_pr_plan_conflicts.md) — every wave PR marks its row shipped in same plan; resolve via `git merge origin/develop` (NOT rebase — preserves Codex anchors).
- [Vite HTML transform rewrites only publicDir URLs](feedback_vite_html_transform.md) — bare-relative + closeBundle-emitted asset hrefs are never rewritten; describe browser-side runtime resolution in specs, not "Vite handles `base`".
