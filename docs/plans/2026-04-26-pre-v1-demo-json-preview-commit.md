# JSON tuning — preview + commit (Pillar 4) — pre-v1 demo evolution

Plan date: 2026-04-26
Wave: B
Tracker PR: [#129](https://github.com/Luis85/agentonomous/pull/129) — every PR cut from this plan must include `Tracks: #129` in its body.
Companion docs:
- Planning doc: [`docs/product/2026-04-26-pre-v1-demo-evolution-plan.md`](../product/2026-04-26-pre-v1-demo-evolution-plan.md) → §4 JSON tuning evolution
- Design doc: [`docs/specs/2026-04-26-pre-v1-demo-evolution-design.md`](../specs/2026-04-26-pre-v1-demo-evolution-design.md) → Cross-pillar contracts → `ConfigDraft`
- Spec: [`docs/specs/2026-04-26-pre-v1-demo-evolution-spec.md`](../specs/2026-04-26-pre-v1-demo-evolution-spec.md) → §P4

## Goal

Replace the existing restart-only JSON apply flow with a single pre-v1
model: **Preview (session-only)** + **Commit + Restart (persisted)**,
keyed off a whitelist of safely previewable fields.

## Pre-flight

- Blocked by: rename preflight.
- Coordinates with **Pillar 3** — every commit triggers a fresh
  fingerprint window. Confirm the `useFingerprintRecorder` API is
  stable before slice 4.3 lands.
- Pre-v1 policy applies: the legacy restart-only path is **removed**,
  not left as a fallback.

## Roadmap

| # | Slice | Files | Spec FRs | Status | PR |
|---|---|---|---|---|---|
| 4.1 | Whitelisted-field schema + validator (pure domain) | `examples/product-demo/src/demo-domain/config/{types.ts,schema.ts,validate.ts,diff.ts}`, `examples/product-demo/test/demo-domain/config/*.test.ts` | P4-FR-2, P4-FR-6 | not started | — |
| 4.2 | `useConfigDraft` domain store + preview lifecycle (headless) | `examples/product-demo/src/stores/domain/useConfigDraft.ts`, `examples/product-demo/test/stores/domain/useConfigDraft.test.ts` | P4-FR-1, P4-FR-3, P4-FR-5 | not started | — |
| 4.3 | Editor view: Preview / Commit+Restart actions, diff summary, inline validation | `examples/product-demo/src/views/JsonEditorView.vue`, `examples/product-demo/src/components/config/{EditorPanel.vue,DiffSummary.vue,ValidationList.vue,ActionRow.vue}`, `examples/product-demo/src/stores/view/useJsonEditorView.ts` | P4-FR-3, P4-FR-4 | not started | — |
| 4.4 | Storage migration cleanup + commit-triggers-fingerprint wiring | `examples/product-demo/src/app/main.ts` (legacy purge tick), `examples/product-demo/src/stores/domain/useConfigDraft.ts` (commit handshake with `useFingerprintRecorder`) | P4-FR-7, P4-AC-5 | not started | — |

## Slice notes

### 4.1 — Schema first

- The whitelist is declarative: `{ path: ConfigPath, kind: 'preview' | 'commit' }`.
  All other fields are commit-only by default — explicit > implicit.
- Validators return `ValidationFinding[]`; tests assert that an invalid
  draft never partially applies (P4-AC-4 evidence).

### 4.2 — Headless lifecycle

- `preview()` applies the draft to the live session via a domain-level
  patch action; `revert()` restores from the committed config; both must
  complete within ≤ 1 tick.
- `commit()` writes `demo.v2.config.committed.<activeScenarioId>`,
  restarts the session, and calls
  `useFingerprintRecorder.beginWindow(scope)` with a scope key that
  includes the new `configHash` (per the design's coordination rules).
  The scenario-suffixed key shape matches the design's storage table —
  no shared `demo.v2.config.committed` key.

### 4.3 — UI without leaks

- Editor view re-renders on draft mutation only — not per tick. Use
  computed `diff` from the domain store; do not recompute per keystroke.
- Both actions disable while `invalid.length > 0`; commit-only fields
  disable Preview specifically (P4-AC-3 evidence).

### 4.4 — Migration cleanup

- The rename preflight already deleted legacy keys on first load. This
  slice ensures the **shape** purge happens too: any pre-existing
  `demo.v2.config.committed.<scenarioId>` value with `v !== 1` is
  discarded and re-initialized from defaults (per spec STO-1). Any
  legacy unsuffixed `demo.v2.config.committed` key from an earlier
  iteration is also dropped on first load.

## Open question (OQ-P4)

- Whether the diff summary ships with field-level color cues this
  increment or in a polish PR. Decide in slice 4.3 review based on
  visual density of the editor pane. Record the decision in Done log.

## Verification gates

- `npm run verify` — green per slice.
- Commit + reload preserves the new shape; no migrator runs (P4-AC-5).
- Preview + Revert cycle leaves fingerprint state unchanged (P3 evidence).
- Invalid edits never partially apply (random property test where
  applicable).

## Definition of done

- Spec criteria P4-AC-1 through P4-AC-5 all met.
- OQ-P4 (color cues) decision recorded.
- PR #129 tracker table row for "JSON preview/commit" set to ✅ with
  every merged PR linked.

## Done log

- (none yet)
