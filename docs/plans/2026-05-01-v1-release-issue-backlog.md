# v1.0 Release Backlog — GitHub Issue Drafts

Date: 2026-05-01

This backlog converts currently open plan rows and unchecked review findings into issue-sized chunks that can be picked up independently.

## Source audit

Primary open-work sources:
- `docs/product/2026-04-26-pre-v1-demo-evolution-plan.md` Tracker table rows still marked `not started`.
- `docs/plans/2026-04-26-pre-v1-demo-*.md` slice tables still marked `not started`.
- `docs/plans/2026-04-26-quality-automation-routines.md` rows 6–8 still marked `not started`.
- `docs/daily-reviews/2026-04-26.md`, `2026-04-27.md`, `2026-04-28.md`, `2026-04-30.md` unchecked findings.

---

## Epic 1 — Demo v2 pillars to reach pre-v1 completion

### Issue 1 — Pillar 2 scaffolding: rolling diff metrics + store wiring
**Scope:** slices 2.1 + 2.2.
**Deliverables:**
- Add `examples/product-demo/src/demo-domain/diff/**` pure metric modules.
- Wire `AGENT_TICKED` capture in `useAgentSession` and headless `useDiffPanelView`.
- Unit tests for metrics and store integration.
**Done when:** all P2-FR-1/2/4/5 acceptance checks in plan are green.

### Issue 2 — Pillar 2 UI: diff card + "what changed" summary
**Scope:** slice 2.3.
**Deliverables:**
- `DiffCard.vue`, `MetricRow.vue`, `WhatChangedSummary.vue`, `DiffView.vue`.
- Render visible delta within 1–3 ticks after mode switch.
- UI tests for empty-peer-mode and steady-state behavior.

### Issue 3 — Pillar 2 hardening: confidence labels + threshold tuning
**Scope:** slice 2.4.
**Deliverables:**
- `confidence.ts` model and threshold constants.
- Soak-tested defaults and test notes captured in plan done-log.

### Issue 4 — Pillar 2 migration: cognition switcher/SVG renderers into Vue SFCs
**Scope:** slice 2.5.
**Deliverables:**
- Port `cognitionSwitcher.ts` to `<CognitionSwitcher>` + `setMode` store API.
- Port `lossSparkline.ts` / `predictionStrip.ts` to SFCs.
- Delete legacy files after parity tests pass.

### Issue 5 — Pillar 3 core: deterministic fingerprint domain + recorder store
**Scope:** slices 3.1 + 3.2.
**Deliverables:**
- Normalizer/hash/scope-key helpers.
- `useFingerprintRecorder` with deterministic persistence model.
- Unit tests including stable hash regression snapshots.

### Issue 6 — Pillar 3 UI + E2E: badge/report/seed panel + known-good replay script
**Scope:** slices 3.3 + 3.4.
**Deliverables:**
- `<FingerprintBadge>`, `<ReplayReport>`, `<CopyReportButton>`, `<SeedPanel>`, `ReplayView`.
- `replay-determinism.spec.ts` exercising matched/diverged/insufficient-sample paths.

### Issue 7 — Pillar 4 engine: cross-scenario config schema + validation/diff engine
**Scope:** slice 4.1.
**Deliverables:**
- `demo-domain/config/**` core types/schema/validator/diff.
- Relocate pet-care config logic into scenario config modules.
- Tests for preview-vs-commit whitelist semantics.

### Issue 8 — Pillar 4 flow: `useConfigDraft` preview lifecycle + commit handshake
**Scope:** slices 4.2 + 4.4 (domain).
**Deliverables:**
- Headless preview apply/revert lifecycle in store.
- Commit triggers restart + fingerprint reset handshake.
- Legacy key cleanup in `app/main.ts` per plan.

### Issue 9 — Pillar 4 UI migration: JSON editor view + delete legacy mount module
**Scope:** slice 4.3.
**Deliverables:**
- New editor component stack and view store.
- Remove `examples/product-demo/src/speciesConfig.ts` after coverage parity.

### Issue 10 — Pillar 5 scenario expansion: scenario contract + catalog + selector route
**Scope:** slices 5.1 + 5.2.
**Deliverables:**
- `Scenario` contract and `useScenarioCatalog`.
- Wrap pet-care into `Scenario` value.
- Add scenario selector UI and `/play/:scenarioId` routing.

### Issue 11 — Pillar 5 content: `companion-npc` reference scenario
**Scope:** slice 5.3.
**Deliverables:**
- Scenario implementation with config + skills.
- Contract tests confirming behavior and determinism constraints.

### Issue 12 — Pillar 5 polish: per-scenario seed/config persistence + scenario-swap E2E
**Scope:** slice 5.4.
**Deliverables:**
- Scenario-scoped storage keys and migration behavior.
- `scenario-swap.spec.ts` with route/state integrity checks.

---

## Epic 2 — Quality automation rows still open

### Issue 13 — Quality row 6: determinism replay baseline workflow
- Implement `tests/determinism/replay.ts` + baseline artifact.
- Add dual-mode scripts and CI workflow from plan.

### Issue 14 — Quality row 7: mutation testing weekly run
- Add Stryker config, scripts, artifact upload.
- Keep report-open instruction cross-platform (no macOS-only helper).

### Issue 15 — Quality row 8: nightly demo smoke workflow
- Add/align Playwright smoke at demo level.
- CI path trigger and smoke assertion reliability.

---

## Epic 3 — Open daily-review findings to convert into tracked fixes

### Issue 16 — Resolve unchecked MINOR findings in daily reviews (batch)
Checklist:
- 2026-04-26 `CognitionPipeline.ts:143` stage-blocked failure branch test coverage.
- 2026-04-26 `TfjsReasoner.ts:401` concurrency safety in `detectBestBackend`.
- 2026-04-27 `PlayView.vue:11` seed key duplication drift risk.
- 2026-04-27 `cognitionSwitcher.ts:442` reasoner/learner wiring race window.
- 2026-04-28 `useAgentSession.ts:321-322` stale-epoch dispose + learning-mode learner wiring.
- 2026-04-30 `useAgentSession.test.ts:415` brittle microtask flush depth in tests.

(Keep NIT-only findings optional unless they gate maintainability.)

---

## Suggested labels/milestones for all issues

- Labels: `v1`, `demo-v2`, `quality`, `good-first-slice` (where applicable), `determinism`, `cognition`, `config`, `scenario`, `ci`.
- Milestone: `v1.0`.
- Body footer convention: `Tracks: #132` for Demo-v2 pillar items.
