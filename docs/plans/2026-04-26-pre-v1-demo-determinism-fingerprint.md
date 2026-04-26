# Determinism fingerprint — pre-v1 demo evolution (Pillar 3)

Plan date: 2026-04-26
Wave: A → C
Tracker issue: [#132](https://github.com/Luis85/agentonomous/issues/132) — every PR cut from this plan must include `Tracks: #132` in its body. (Originating PR [#129](https://github.com/Luis85/agentonomous/pull/129) landed the doc set; the live tracker is now the issue.)
Companion docs:
- Planning doc: [`docs/product/2026-04-26-pre-v1-demo-evolution-plan.md`](../product/2026-04-26-pre-v1-demo-evolution-plan.md) → §3 Determinism proof artifact
- Design doc: [`docs/specs/2026-04-26-pre-v1-demo-evolution-design.md`](../specs/2026-04-26-pre-v1-demo-evolution-design.md) → Determinism fingerprint design
- Spec: [`docs/specs/2026-04-26-pre-v1-demo-evolution-spec.md`](../specs/2026-04-26-pre-v1-demo-evolution-spec.md) → §P3

## Goal

Turn replay determinism from "we have a button" into "we have a
copyable verdict" — `Matched`, `Diverged`, or `Insufficient sample` —
backed by a normalized run fingerprint.

## Pre-flight

- Blocked by: rename preflight.
- Hash function (`sha-256` truncated to 128 bits) and normalized input
  set are fixed in the design — do not relitigate per slice.
- `minSampleFraction` initial value `0.95` is **OQ-P3**; tune in slice
  3.4 after first soak.

## Roadmap

| # | Slice | Files | Spec FRs | Status | PR |
|---|---|---|---|---|---|
| 3.1 | Normalizer + hash function (pure domain) + scope-key encoder | `examples/product-demo/src/demo-domain/fingerprint/{types.ts,normalize.ts,hash.ts,scopeKey.ts}`, `examples/product-demo/test/demo-domain/fingerprint/*.test.ts` | P3-FR-1, P3-FR-6 | not started | — |
| 3.2 | `useFingerprintRecorder` domain store + persistence shape | `examples/product-demo/src/stores/domain/useFingerprintRecorder.ts`, `examples/product-demo/test/stores/domain/useFingerprintRecorder.test.ts` | P3-FR-1, P3-FR-4, P3-FR-5 | not started | — |
| 3.3 | `<FingerprintBadge>` + `<ReplayReport>` components + copy action | `examples/product-demo/src/components/fingerprint/{FingerprintBadge.vue,ReplayReport.vue,CopyReportButton.vue}`, `examples/product-demo/src/views/ReplayView.vue` | P3-FR-2, P3-FR-3 | not started | — |
| 3.4 | Known-good script + Playwright `replay-determinism.spec.ts` + tuning | `examples/product-demo/src/demo-domain/fingerprint/knownGoodScripts.ts`, `examples/product-demo/tests/e2e/replay-determinism.spec.ts` | P3-FR-7, P3-AC-1, P3-AC-2, P3-AC-3, P3-AC-4, P3-AC-5 | not started | — |

## Slice notes

### 3.1 — Locked normalization

- Fields **included** and **excluded** from the hash are exactly the
  lists in the design doc. A drift between this normalizer and the
  design is the bug.
- Hash output: 128-bit truncated `sha-256`, hex-encoded. Use
  `globalThis.crypto.subtle` where available; tests can use a Node
  crypto polyfill in the headless environment.
- Scope-key encoder must be reversible enough that
  `decodeScopeKey(encodeScopeKey(x))` round-trips for tests, but the
  on-wire form is opaque to UI.

### 3.2 — Recorder semantics

- "Record + verdict" must not mutate the agent. Add a no-mutation test
  that snapshots agent state before and after `verdict()` and asserts
  equality (P3-FR-6 evidence).
- Persisted shape: `{ v: 1, data: Record<FingerprintScopeKey, string> }`
  per the design's persistence rules.

### 3.3 — UI

- Badge: three colors + ARIA label restating the verdict (NFR-A-2).
- Report: copyable Markdown matches the spec's exact shape table.
- View: `/replay` route with optional `?seed=&mode=&config=&scenario=`
  query-string scoping per the design's route guard.

### 3.4 — End-to-end + tune

- Known-good script is a deterministic action sequence (start, step N
  ticks, switch mode, step N more ticks, copy report).
- Playwright runs the script twice; the second run MUST produce
  `Matched` against the digest recorded by the first.
- Inject a test-only `Math.random()` override into a cloned config and
  assert `Diverged` (P3-AC-3 evidence).
- After the first stable run, tune `minSampleFraction` if `0.95` proves
  too strict or too lenient. Record the chosen value in the Done log.

## Verification gates

- `npm run verify` — green per slice.
- `npm run e2e -- replay-determinism` — green after slice 3.4.
- A `Diverged` verdict reproduces deterministically when nondeterminism
  is injected (gate against false `Matched`).

## Definition of done

- Spec criteria P3-AC-1 through P3-AC-5 all met.
- `minSampleFraction` final value chosen and recorded in Done log.
- Planning-doc tracker table row for "Determinism fingerprint" set to ✅
  with every merged PR linked.

## Done log

- (none yet)
