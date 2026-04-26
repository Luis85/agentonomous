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
| 1.2a | Vue 3 / Pinia 2 / Vue Router 4 shell bootstrap + `git mv` salvage of pure legacy modules into `demo-domain/scenarios/petCare/` + `useAgentSession` domain store wrapping `buildAgent` factory | `examples/product-demo/package.json` (vue/pinia/vue-router/@vue/test-utils/@pinia/testing/@vue/eslint-parser/eslint-plugin-vue), `examples/product-demo/src/{app/App.vue,app/main.ts,routes/index.ts,views/IntroView.vue,views/PlayView.vue,components/shell/AppHeader.vue,stores/domain/useAgentSession.ts,composables/}`, `git mv` of `examples/product-demo/src/{species.ts,constants.ts,cognition/**,skills/**}` → `examples/product-demo/src/demo-domain/scenarios/petCare/{species.ts,constants.ts,cognition/**,skills/**}`, new `examples/product-demo/src/demo-domain/scenarios/petCare/buildAgent.ts` (random-event defs + skill registry wiring extracted from legacy `main.ts`), `examples/product-demo/eslint.config.js` (drop relocated paths from `ignores`, add Vue SFC parser), `examples/product-demo/test/stores/domain/useAgentSession.test.ts` | P1-FR-1 (CTA scaffolding) | not started | — |
| 1.2b | Chapter-1 vertical: port `mountHud`→`<HudPanel>` + `mountTraceView`→`<TracePanel>`, introduce `useTourProgress` view store + `<TourOverlay>` + `<StepHighlight>`, chapter-1 (autonomy) step content, **delete** legacy `examples/product-demo/src/{ui.ts,traceView.ts,seed.ts,speciesConfig.ts,cognitionSwitcher.ts,lossSparkline.ts,predictionStrip.ts,main.ts}` (their logic now lives in SFCs+stores OR is preserved for the Pillar 2 / 4 ports — see "Recycle deferral" below) | `examples/product-demo/src/components/{shell/HudPanel.vue,trace/TracePanel.vue,tour/TourOverlay.vue,tour/StepHighlight.vue}`, `examples/product-demo/src/stores/view/useTourProgress.ts`, `examples/product-demo/src/demo-domain/walkthrough/chapters/1.ts`, `examples/product-demo/test/stores/view/useTourProgress.test.ts`, `examples/product-demo/test/components/{HudPanel,TracePanel,TourOverlay}.test.ts`, `examples/product-demo/src/copy/tour.ts` | P1-FR-1, P1-FR-3, P1-FR-5, P1-FR-6, P1-FR-8 | not started | — |
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
- **`app/main.ts` rewrite:** replaces the `await import('../main.js')`
  bridge with the Vue app mount (`createApp(App).use(pinia).use(router)
  .mount(...)`). The STO-3 legacy-key purge stays as the first step.
- **Legacy `main.ts` deletion is deferred to 1.2b** so the live demo
  keeps booting via the bridge until the chapter-1 vertical replaces it.
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
- **Legacy file deletion (clean break per pre-v1 policy):** delete
  `examples/product-demo/src/{ui.ts, traceView.ts, seed.ts,
  speciesConfig.ts, main.ts}`. `cognitionSwitcher.ts`,
  `lossSparkline.ts`, `predictionStrip.ts` stay until **Pillar 2**
  ports them; `speciesConfig.ts`'s pure logic (validator + applyOverride)
  stays available for **Pillar 4** to relocate. Update
  `eslint.config.js` `ignores` accordingly each step. Note: the legacy
  `agentonomous/seed`, `agentonomous/speed`, `agentonomous/trace-visible`,
  `agentonomous/species-config`, `whiskers`, `whiskers:speed` localStorage
  keys are NOT migrated (pre-v1 clean break) — the new shell uses the
  `demo.v2.*` namespace exclusively per design's storage contract.

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
