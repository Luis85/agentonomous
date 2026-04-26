# Cognition difference panel — pre-v1 demo evolution (Pillar 2)

Plan date: 2026-04-26
Wave: A → B
Tracker issue: [#132](https://github.com/Luis85/agentonomous/issues/132) — every PR cut from this plan must include `Tracks: #132` in its body. (Originating PR [#129](https://github.com/Luis85/agentonomous/pull/129) landed the doc set; the live tracker is now the issue.)
Companion docs:
- Planning doc: [`docs/product/2026-04-26-pre-v1-demo-evolution-plan.md`](../product/2026-04-26-pre-v1-demo-evolution-plan.md) → §2 Cognition difference panel
- Design doc: [`docs/specs/2026-04-26-pre-v1-demo-evolution-design.md`](../specs/2026-04-26-pre-v1-demo-evolution-design.md) → Cross-pillar contracts → `DiffMetric`
- Spec: [`docs/specs/2026-04-26-pre-v1-demo-evolution-spec.md`](../specs/2026-04-26-pre-v1-demo-evolution-spec.md) → §P2

## Goal

Render structured behavioral deltas after every cognition mode swap so
users see — not infer — what changed between modes.

## Pre-flight

- Blocked by: rename preflight.
- `DiffMetric<T>` contract is fixed in the design doc; no per-pillar
  variant.
- Initial confidence-label thresholds are placeholders (**OQ-P2**);
  tune in slice 2.4 after the first soak.

## Roadmap

| # | Slice | Files | Spec FRs | Status | PR |
|---|---|---|---|---|---|
| 2.1 | Rolling-window `DiffMetric<T>` helpers (pure domain) | `examples/product-demo/src/demo-domain/diff/{types.ts,ringBuffer.ts,metrics/{topIntention.ts,skillDistribution.ts,urgencyGap.ts,interruption.ts}}`, `examples/product-demo/test/demo-domain/diff/*.test.ts` | P2-FR-1, P2-FR-2 | not started | — |
| 2.2 | Domain-store wiring to `AGENT_TICKED` (no UI) | `examples/product-demo/src/stores/domain/useAgentSession.ts` (subscriber wiring), `examples/product-demo/src/stores/view/useDiffPanelView.ts`, `examples/product-demo/test/stores/**` | P2-FR-4, P2-FR-5 | not started | — |
| 2.3 | Diff card component + "What changed" summary on mode swap | `examples/product-demo/src/components/diff/{DiffCard.vue,MetricRow.vue,WhatChangedSummary.vue}`, `examples/product-demo/src/views/DiffView.vue` | P2-FR-3, P2-FR-6 | not started | — |
| 2.4 | Confidence labels, sample-window thresholds, soak-tuned defaults | `examples/product-demo/src/demo-domain/diff/confidence.ts`, tests + tuning notes in this plan's Done log | P2-FR-2, P2-AC-2 | not started | — |

## Slice notes

### 2.1 — Pure domain module

- All four metrics implement the same `DiffMetric<T>` shape so the
  panel can iterate over them generically.
- Ring-buffer is bounded by `windowTicks`; tests assert constant memory
  under steady state (P2-AC-4 evidence).

### 2.2 — Subscription hygiene

- Subscribe **once** to `AGENT_TICKED` from `useAgentSession`; every
  metric receives the same tick projection. No per-component subscription.
- Verify in tests that an unmount/remount of the diff view does not
  leak listeners (NFR-P-3 evidence).

### 2.3 — UI without per-frame churn

- The `DiffCard` re-renders only when a metric's snapshot changes
  (track snapshot identity, not per-tick). A 10-minute soak with the
  panel open is the gate.
- Mode-unavailability rendering MUST surface the unavailability message
  per P2-FR-5; verify with a stubbed unavailable-mode probe.

### 2.4 — Tune after data

- Initial thresholds (`minSampleSize: 30`, `windowTicks: 200`) are
  placeholders. Run a 10-minute soak in `pet-care` across all available
  cognition modes; record the actual sample sizes needed for stable
  labels and tune the constants.
- Document the chosen values in this plan's Done log so the rationale
  survives the PR description.

## Verification gates

- `npm run verify` — green per slice.
- 10-minute soak with diff panel open shows constant memory + no
  listener leaks (DevTools heap snapshot parity).
- Switching between every available cognition mode produces a visible
  delta within ≤ 3 ticks of post-swap data.

## Definition of done

- Spec criteria P2-AC-1 through P2-AC-4 all met.
- Tuning constants chosen and recorded in the Done log.
- Planning-doc tracker table row for "Cognition diff panel" set to ✅
  with every merged PR linked.

## Done log

- (none yet)
