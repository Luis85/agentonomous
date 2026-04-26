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
- Tour copy tone is **OQ-P1** (open question) — settle in slice 1.1 review.

## Roadmap

| # | Slice | Files | Spec FRs | Status | PR |
|---|---|---|---|---|---|
| 1.1 | Step-graph + completion-predicate domain module + headless tests | `examples/product-demo/src/demo-domain/walkthrough/{types.ts,graph.ts,predicates.ts}`, `examples/product-demo/test/demo-domain/walkthrough/*.test.ts` | P1-FR-2, P1-FR-3, P1-FR-4 | not started | — |
| 1.2 | `useTourProgress` view store + tour overlay component (chapter 1 only) | `examples/product-demo/src/stores/view/useTourProgress.ts`, `examples/product-demo/src/components/tour/{TourOverlay.vue,StepHighlight.vue}`, `examples/product-demo/test/stores/view/useTourProgress.test.ts` | P1-FR-1, P1-FR-3, P1-FR-5, P1-FR-6, P1-FR-8 | not started | — |
| 1.3 | Chapters 2-5 wired end-to-end + restart/skip/resume + selector-handle registry | `examples/product-demo/src/demo-domain/walkthrough/chapters/{2..5}.ts`, `examples/product-demo/src/components/**/registerSelector.ts`, `examples/product-demo/src/views/TourView.vue` | P1-FR-2, P1-FR-4, P1-FR-5, P1-FR-6, P1-FR-7 | not started | — |
| 1.4 | Playwright `tour-happy-path.spec.ts` | `examples/product-demo/tests/e2e/tour-happy-path.spec.ts`, `examples/product-demo/playwright.config.ts` (script wiring) | P1-AC-1, P1-AC-5 | not started | — |

## Slice notes

### 1.1 — Domain module

- Pure TypeScript under `demo-domain/walkthrough/`. No Vue, no Pinia,
  no DOM. Tests use `SeededRng` + `ManualClock` against synthesized
  `AgentSessionSnapshot` projections.
- The `SelectorHandle` type is defined here as a branded string; the
  per-component registry is added in slice 1.3.

### 1.2 — Chapter-1 vertical slice

- Scope intentionally narrow: end-to-end vertical for chapter 1 only
  (autonomy). Validates the shape (overlay, predicate, advance) before
  fanning out to all five chapters.
- View-store tests use `@pinia/testing` with stubbed `useAgentSession`
  snapshots.

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

- (none yet)
