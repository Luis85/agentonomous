# Guided walkthrough — pre-v1 demo evolution (Pillar 1)

Plan date: 2026-04-26
Wave: A → C
Tracker issue: [#132](https://github.com/Luis85/agentonomous/issues/132) — every PR cut from this plan must include `Tracks: #132` in its body. (Originating PR [#129](https://github.com/Luis85/agentonomous/pull/129) landed the doc set; the live tracker is now the issue.)
Companion docs:
- Planning doc: [`docs/product/2026-04-26-pre-v1-demo-evolution-plan.md`](../product/2026-04-26-pre-v1-demo-evolution-plan.md) → §1 Guided walkthrough
- Design doc: [`docs/specs/2026-04-26-pre-v1-demo-evolution-design.md`](../specs/2026-04-26-pre-v1-demo-evolution-design.md) → Cross-pillar contracts → `WalkthroughStep`
- Spec: [`docs/specs/2026-04-26-pre-v1-demo-evolution-spec.md`](../specs/2026-04-26-pre-v1-demo-evolution-spec.md) → §P1

## Goal

Ship an in-product guided walkthrough that takes a first-time visitor
through five comprehension chapters (autonomy, trace visibility,
cognition switching, JSON tuning, deterministic replay) without
external narration.

## Pre-flight

- Blocked by: rename preflight (`docs/plans/2026-04-26-pre-v1-demo-rename-preflight.md`). The `WalkthroughStep` contract lives under `examples/product-demo/src/demo-domain/walkthrough/` so the rename must merge first.
- Worktree pattern: `.worktrees/feat-tour-<slice>/`.
- Tour copy tone is **OQ-P1** (open question) — settle in slice 1.2b review.
- **Legacy recycle.** Slice 1.2a relocates pure modules from the legacy
  vanilla-TS demo (`examples/product-demo/src/{species.ts,constants.ts,
  cognition/*,skills/*}` + the random-event + agent-construction recipe in
  the legacy `main.ts`) into `examples/product-demo/src/demo-domain/scenarios/petCare/`
  via `git mv` (history preserved). Slice 1.2b ports the DOM-mount UI
  (`mountHud`, `mountTraceView`) into Vue SFCs, reusing the data tables
  (INTERACTION_BUTTONS, STAGE_LABELS, NEEDS, lifetime counters) verbatim.
  Cognition switcher port + JSON editor port deferred to **Pillar 2** /
  **Pillar 4** (those plans recycle `cognitionSwitcher.ts` /
  `lossSparkline.ts` / `predictionStrip.ts` and `speciesConfig.ts` directly).

## Roadmap

| # | Slice | Files | Spec FRs | Status | PR |
|---|---|---|---|---|---|
| 1.1 | Step-graph + completion-predicate domain module + headless tests | `examples/product-demo/src/demo-domain/walkthrough/{types.ts,graph.ts,predicates.ts}`, `examples/product-demo/test/demo-domain/walkthrough/*.test.ts` | P1-FR-2, P1-FR-3, P1-FR-4 | ✅ shipped | [#140](https://github.com/Luis85/agentonomous/pull/140) |
| 1.2a | Vue 3 / Pinia 2 / Vue Router 4 shell bootstrap + `git mv` salvage of pure legacy modules into `demo-domain/scenarios/petCare/` + `useAgentSession` domain store wrapping `buildAgent` factory | `examples/product-demo/package.json` (vue/pinia/vue-router/@vue/test-utils/@pinia/testing/vue-eslint-parser/eslint-plugin-vue), `examples/product-demo/src/{app/App.vue,app/main.ts,routes/index.ts,views/IntroView.vue,views/PlayView.vue,components/shell/AppHeader.vue,stores/domain/useAgentSession.ts,composables/}`, `git mv` of `examples/product-demo/src/{species.ts,constants.ts,cognition/**,skills/**}` → `examples/product-demo/src/demo-domain/scenarios/petCare/{species.ts,constants.ts,cognition/**,skills/**}`, new `examples/product-demo/src/demo-domain/scenarios/petCare/buildAgent.ts` (random-event defs + skill registry wiring extracted from legacy `main.ts`), `examples/product-demo/eslint.config.js` (drop relocated paths from `ignores`, add Vue SFC parser), `examples/product-demo/test/stores/domain/useAgentSession.test.ts` | P1-FR-1 (CTA scaffolding) | ✅ shipped | [#146](https://github.com/Luis85/agentonomous/pull/146) |
| 1.2b | Chapter-1 vertical: port `mountHud`→`<HudPanel>`, `mountSpeedPicker`→`<SpeedPicker>`, `mountResetButton`→`<ResetButton>`, `mountExportImport`→`<ExportImportPanel>`, `mountTraceView`→`<TracePanel>`; introduce `useTourProgress` view store + `<TourOverlay>` + `<StepHighlight>`; chapter-1 (autonomy) step content; rewrite `app/main.ts` to mount Vue (replaces Wave-0 `await import('../main.js')` bridge); **delete** legacy `examples/product-demo/src/{ui.ts,traceView.ts,seed.ts,main.ts}` (their logic now lives in SFCs+stores). `cognitionSwitcher.ts`, `lossSparkline.ts`, `predictionStrip.ts`, `speciesConfig.ts` are explicitly NOT deleted here — Pillar 2 slice 2.5 deletes the first three after porting them; Pillar 4 slice 4.3 deletes `speciesConfig.ts` after relocating its pure logic. | `examples/product-demo/src/app/main.ts` (bridge swap), `examples/product-demo/src/components/{shell/HudPanel.vue,shell/SpeedPicker.vue,shell/ResetButton.vue,shell/ExportImportPanel.vue,trace/TracePanel.vue,tour/TourOverlay.vue,tour/StepHighlight.vue}`, `examples/product-demo/src/stores/view/useTourProgress.ts`, `examples/product-demo/src/demo-domain/walkthrough/chapters/1.ts`, `examples/product-demo/test/stores/view/useTourProgress.test.ts`, `examples/product-demo/test/components/{HudPanel,SpeedPicker,ResetButton,ExportImportPanel,TracePanel,TourOverlay}.test.ts`, `examples/product-demo/src/copy/tour.ts` | P1-FR-1, P1-FR-3, P1-FR-5, P1-FR-6, P1-FR-8 | ✅ shipped | [#150](https://github.com/Luis85/agentonomous/pull/150) |
| 1.3 | Chapters 2-5 wired end-to-end + restart/skip/resume + selector-handle registry | `examples/product-demo/src/demo-domain/walkthrough/chapters/{2..5}.ts`, `examples/product-demo/src/components/**/registerSelector.ts`, `examples/product-demo/src/views/TourView.vue` | P1-FR-2, P1-FR-4, P1-FR-5, P1-FR-6, P1-FR-7 | not started | — |
| 1.4 | Playwright `tour-happy-path.spec.ts` | `examples/product-demo/tests/e2e/tour-happy-path.spec.ts`, `examples/product-demo/playwright.config.ts` (script wiring) | P1-AC-1, P1-AC-5 | not started | — |

## Slice notes

### 1.1 — Domain module

- Pure TypeScript under `demo-domain/walkthrough/`. No Vue, no Pinia,
  no DOM. Tests use `SeededRng` + `ManualClock` against synthesized
  `AgentSessionSnapshot` projections.
- The `SelectorHandle` type is defined here as a branded string; the
  per-component registry is added in slice 1.3.

### 1.2a — Bootstrap + salvage

- **Adds workspace deps:** `vue@^3`, `pinia@^2`, `vue-router@^4`,
  `@vue/test-utils`, `@pinia/testing`, `@vue/eslint-parser`,
  `eslint-plugin-vue`, `@types/node` (for the bootstrap `app/main.ts`
  rewrite). `lint:demo` continues to enforce the design's DDD
  forbidden-import + NFR-D-1 determinism rules.
- **`git mv` salvage** (history preserved):
  - `src/species.ts` → `src/demo-domain/scenarios/petCare/species.ts`
  - `src/constants.ts` → `src/demo-domain/scenarios/petCare/constants.ts`
  - `src/cognition/{heuristic,bt,bdi,learning,index}.ts` +
    `learning.network.json` → `src/demo-domain/scenarios/petCare/cognition/`
  - `src/skills/ApproachTreatSkill.ts` →
    `src/demo-domain/scenarios/petCare/skills/ApproachTreatSkill.ts`
- **New `src/demo-domain/scenarios/petCare/buildAgent.ts`** factory: takes
  `{ seed, speciesOverride? }` and returns a fully-wired `Agent`
  (random-event defs + skill registry wiring + `createAgent` call
  extracted verbatim from the legacy `main.ts`). Pure TS — no DOM, no
  Pinia.
- **`useAgentSession` domain store** wraps `buildAgent`: owns the live
  `Agent`, the tick loop, control-mode actions (`start` / `pause` /
  `resume` / `step` / `setSpeed` / `replayFromSnapshot`), and exposes
  `subscribe` for view stores. Storage key `demo.v2.session.lastSeed.<scenarioId>`
  per design's STO contract (the legacy `agentonomous/seed` +
  `whiskers` keys are NOT migrated — pre-v1 clean break).
- **`app/main.ts` is NOT rewired in this slice.** The Wave-0 bridge
  (`await import('../main.js')`) keeps booting the legacy demo so the
  live URL stays functional while the Vue infrastructure is added in
  parallel. The STO-3 purge stays as the first step. The actual swap
  (replace bridge with `createApp(App).use(pinia).use(router).mount(...)`
  and delete legacy `src/main.ts`) happens in 1.2b once the
  chapter-1 vertical is wired and renders something the user can see.
- **`App.vue` + `routes/index.ts` + `views/{IntroView,PlayView}.vue`
  scaffold land here** but are not the live entry yet — they are
  importable, type-checkable, and unit-testable; switching the entry
  point is what 1.2b does.
- **eslint.config.js update:** the `ignores` list drops the relocated
  paths; the `*.vue` SFC parser is wired (no-op until the first SFC
  arrives in 1.2b but eliminates the parser-mismatch surprise).

### 1.2b — Chapter-1 vertical + DOM-mount port

- Scope intentionally narrow: end-to-end vertical for chapter 1
  (autonomy) only. Validates the shape (overlay, predicate, advance)
  before fanning out to all five chapters.
- **`<HudPanel>`** ports `mountHud` from legacy `ui.ts` — reuses
  `INTERACTION_BUTTONS`, `STAGE_LABELS`, `LIFETIME_COUNTERS` data tables
  verbatim; the per-need bar markup becomes a `<template v-for>` over
  `NEEDS` (already relocated to `demo-domain/scenarios/petCare/constants.ts`).
- **`<SpeedPicker>` + `<ResetButton>` + `<ExportImportPanel>`** port
  the remaining `mountSpeedPicker` / `mountResetButton` /
  `mountExportImport` legacy mounts from `ui.ts` — these are not
  chapter-1-specific but the shell needs them to remain functional
  once the bridge is removed. Logic ports verbatim against
  `useAgentSession` actions (`setSpeed`, `replayFromSnapshot(null)`,
  `exportSnapshot` / `importSnapshot`). The legacy
  `agentonomous/speed` storage key is NOT migrated (pre-v1 clean
  break) — `<SpeedPicker>` writes `demo.v2.session.speed` instead.
- **`<TracePanel>`** ports `mountTraceView` from legacy `traceView.ts`
  — keeps the four-section computation (summary / needs / candidates /
  selected) but lets Vue handle reactivity; the legacy "near-zero DOM
  work" diff trick (serialized signature compare) is no longer needed.
- **`useTourProgress`** view store: cursor (`lastStep`),
  `completedAt`, `skipped[]`. Reads `useAgentSession` projections and
  the route via injected `useRoute`. `@pinia/testing` for unit tests
  with stubbed snapshots.
- **`<TourOverlay>` + `<StepHighlight>`** render the active step's
  hint + highlight against the `SelectorHandle` registry stub (full
  registry lands in 1.3).
- **Chapter-1 step content** in `demo-domain/walkthrough/chapters/1.ts`
  uses the slice-1.1 predicate primitives (`tickAtLeast`,
  `eventEmittedSince('AGENT_TICKED', …)`) to detect the agent
  acting on its own.
- **Tour copy tone (OQ-P1) settled here** — pick friendly-informal
  vs. terse-instructional vs. presenter-narration, record the choice
  in this plan's Done log + apply to chapter-1 copy.
- **Bridge swap + legacy file deletion (clean break per pre-v1
  policy):** rewrite `app/main.ts` to swap the Wave-0
  `await import('../main.js')` bridge for the Vue app mount
  (`createApp(App).use(pinia).use(router).mount(...)`) AS THE FIRST
  STEP of this slice — once the new shell renders, delete the
  now-orphaned legacy files
  `examples/product-demo/src/{ui.ts, traceView.ts, seed.ts, main.ts}`
  in the same diff. Their logic lives in the SFCs and stores above.
  `cognitionSwitcher.ts`, `lossSparkline.ts`, `predictionStrip.ts`,
  `speciesConfig.ts` are deliberately NOT deleted here: Pillar 2 slice
  2.5 deletes the first three after porting them, Pillar 4 slice 4.3
  deletes `speciesConfig.ts` after relocating its pure logic
  (`EditableSpeciesConfig` shape, `validateEditableConfig`,
  `applyOverride`) into `demo-domain/scenarios/petCare/config/`.
  Update `eslint.config.js` `ignores` accordingly each step. Note: the
  legacy `agentonomous/seed`, `agentonomous/speed`,
  `agentonomous/trace-visible`, `agentonomous/species-config`,
  `whiskers`, `whiskers:speed` localStorage keys are NOT migrated
  (pre-v1 clean break) — the new shell uses the `demo.v2.*` namespace
  exclusively per design's storage contract.

### 1.3 — Fan-out + resilience

- Adds chapters 2-5 backed by the registry built in 1.1.
- `SelectorHandle` registry is enforced at compile time: a missing
  handle must fail `tsc`, not the running tour (P1-FR-4).
- Reset/replay actions invoked inside the tour preserve cursor (P1-FR-7).

### 1.4 — End-to-end gate

- Playwright script must exercise the full happy path and catch any
  regression introduced by future PRs.
- The script runs in CI on the same matrix as `npm run verify` (already
  wired by the rename preflight slice).

## Verification gates

- `npm run verify` — green for every slice.
- `npm run e2e -- tour-happy-path` — passes after slice 1.4.
- Tour completable without a mouse (NFR-A-1).
- Tour resumable after page reload (P1-AC-2).

## Definition of done

- Spec criteria P1-AC-1 through P1-AC-5 all met.
- Planning-doc tracker table row for "Guided walkthrough" set to ✅
  shipped with every PR linked **in the same PR that ships each row**
  (use the GH-assigned PR number; never chase with a `docs: flip row`
  follow-up — see CLAUDE.md "Plan + doc updates ride with the PR that
  lands the work").
- Issue #132 GH tasklist entries for slices 1.1 - 1.4 ticked.

## Done log

- 2026-04-26 — slice 1.1 (domain module + headless tests) shipped via [#140](https://github.com/Luis85/agentonomous/pull/140).
- 2026-04-26 — slice 1.2a (Vue/Pinia/Router shell bootstrap + petCare salvage + `useAgentSession`) shipped via [#146](https://github.com/Luis85/agentonomous/pull/146). Note: `vue-eslint-parser` (no `@vue/` scope) wired in `eslint.config.js`; root `package.json` mirrors the demo's vue/pinia/vue-router/test-utils set so root `tsc --noEmit` + vitest resolve them without a demo workspace install.
- 2026-04-26 — slice 1.2b (chapter-1 vertical + bridge swap + legacy DOM-mount port) shipped via [#150](https://github.com/Luis85/agentonomous/pull/150). **OQ-P1 settled: tour copy tone is friendly-informal** (chosen over terse-instructional and presenter-narration; recorded in `src/copy/tour.ts` + applied to chapter-1 hint). Notes: (a) `@vitejs/plugin-vue@^6` wired with `isProduction: false` in the root vitest config so `<script setup>` template directives bind correctly under VTU; the demo's own production build leaves the option at default. (b) `useAgentSession` gained `tickIndex` / `recentEvents` / `lastTrace` / `lastTickNumber` / `sessionSnapshot` projections so view-layer SFCs never re-subscribe to `AGENT_TICKED`; the snapshot-restore branch of `replayFromSnapshot(snapshot)` now actually restores. (c) Demo `eslint.config.js`'s `no-restricted-imports` for `components/views/stores/view` was relaxed to permit `import type` from `agentonomous` and `demo-domain/**` (runtime imports stay forbidden). (d) The legacy `agentonomous/*` localStorage namespace is wiped at first mount via the existing STO-3 purge; `demo.v2.session.speed`, `demo.v2.trace.visible`, and `demo.v2.tour.progress` are the only keys the new shell writes.
