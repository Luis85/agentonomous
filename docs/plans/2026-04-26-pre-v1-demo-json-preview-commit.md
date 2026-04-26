# JSON tuning — preview + commit (Pillar 4) — pre-v1 demo evolution

Plan date: 2026-04-26
Wave: B
Tracker issue: [#132](https://github.com/Luis85/agentonomous/issues/132) — every PR cut from this plan must include `Tracks: #132` in its body. (Originating PR [#129](https://github.com/Luis85/agentonomous/pull/129) landed the doc set; the live tracker is now the issue.)
Companion docs:
- Planning doc: [`docs/product/2026-04-26-pre-v1-demo-evolution-plan.md`](../product/2026-04-26-pre-v1-demo-evolution-plan.md) → §4 JSON tuning evolution
- Design doc: [`docs/specs/2026-04-26-pre-v1-demo-evolution-design.md`](../specs/2026-04-26-pre-v1-demo-evolution-design.md) → Cross-pillar contracts → `ConfigDraft`
- Spec: [`docs/specs/2026-04-26-pre-v1-demo-evolution-spec.md`](../specs/2026-04-26-pre-v1-demo-evolution-spec.md) → §P4

## Goal

Replace the existing restart-only JSON apply flow with a single pre-v1
model: **Preview (session-only)** + **Commit + Restart (persisted)**,
keyed off a whitelist of safely previewable fields.

## Pre-flight

- Blocked by: rename preflight + Pillar-1 slice 1.2a (the
  `useAgentSession` factory the editor patches into) + Pillar-1
  slice **1.2b** (slice 4.3 deletes `src/speciesConfig.ts`; the
  legacy `src/main.ts` imports `applyOverride` /
  `loadConfigOverride` / `mountConfigPanel` from it and the Wave-0
  bridge keeps `src/main.ts` live until 1.2b swaps
  `src/app/main.ts` to mount Vue. Running 4.3 before 1.2b would
  break the build).
- Coordinates with **Pillar 3** — every commit triggers a fresh
  fingerprint window. Confirm the `useFingerprintRecorder` API is
  stable before slice 4.3 lands.
- Pre-v1 policy applies: the legacy restart-only path is **removed**,
  not left as a fallback.
- **Legacy recycle.** Pillar-1 slice 1.2b deliberately PRESERVED
  `examples/product-demo/src/speciesConfig.ts` so Pillar 4 can port
  rather than rebuild. The legacy file already contains:
  `EditableSpeciesConfig` shape, `currentEditableConfig`,
  `validateEditableConfig`, `applyOverride`, `loadConfigOverride` —
  all pure logic apart from the localStorage adapters. Slice 4.1
  relocates the pure parts (validator + applyOverride + edit shape)
  into `demo-domain/scenarios/petCare/config/`; slice 4.2 absorbs the storage
  adapter into `useConfigDraft`. The legacy `mountConfigPanel` DOM
  mount is replaced by the new `<JsonEditor>` SFC family (slice 4.3),
  which then deletes `speciesConfig.ts` outright.

## Roadmap

| # | Slice | Files | Spec FRs | Status | PR |
|---|---|---|---|---|---|
| 4.1 | Cross-scenario config engine (pure domain) + pet-care relocation: NEW `demo-domain/config/` engine (`ConfigPath`, `ValidationFinding`, `ConfigDraft` shape, the previewable-field whitelist schema TYPE per spec **P4-FR-2**, schema-driven validator/diff framework) + RELOCATED `speciesConfig.ts`'s pure logic (`EditableSpeciesConfig` → `NormalizedConfig`, `validateEditableConfig` rules, `applyOverride`) into `demo-domain/scenarios/petCare/config/` plugged into the engine. The pet-care SCHEMA INSTANCE (which fields are `preview` vs `commit`) lives in `scenarios/petCare/config/schema.ts`; the schema TYPE + whitelist registry helpers live in `demo-domain/config/schema.ts` to honour the spec's exact path. Replaces the implicit allow-list with the design's explicit `{ path, kind: 'preview' \| 'commit' }` whitelist. | `examples/product-demo/src/demo-domain/config/{types.ts,schema.ts,validateEngine.ts,diff.ts}` (cross-scenario, new — `schema.ts` matches spec P4-FR-2), `examples/product-demo/src/demo-domain/scenarios/petCare/config/{schema.ts,validate.ts,applyOverride.ts}` (per-scenario instance + rules, recycled), `examples/product-demo/test/demo-domain/config/*.test.ts`, `examples/product-demo/test/demo-domain/scenarios/petCare/config/*.test.ts` | P4-FR-2, P4-FR-6 | not started | — |
| 4.2 | `useConfigDraft` domain store + preview lifecycle (headless) | `examples/product-demo/src/stores/domain/useConfigDraft.ts`, `examples/product-demo/test/stores/domain/useConfigDraft.test.ts` | P4-FR-1, P4-FR-3, P4-FR-5 | not started | — |
| 4.3 | Editor view: Preview / Commit+Restart actions, diff summary, inline validation; **delete** legacy `examples/product-demo/src/speciesConfig.ts` once its mount logic is fully replaced | `examples/product-demo/src/views/JsonEditorView.vue`, `examples/product-demo/src/components/config/{EditorPanel.vue,DiffSummary.vue,ValidationList.vue,ActionRow.vue}`, `examples/product-demo/src/stores/view/useJsonEditorView.ts`, `examples/product-demo/eslint.config.js` (drop `speciesConfig.ts` from `ignores`) | P4-FR-3, P4-FR-4 | not started | — |
| 4.4 | Storage migration cleanup + commit-triggers-fingerprint wiring | `examples/product-demo/src/app/main.ts` (legacy purge tick), `examples/product-demo/src/stores/domain/useConfigDraft.ts` (commit handshake with `useFingerprintRecorder`) | P4-FR-7, P4-AC-5 | not started | — |

## Slice notes

### 4.1 — Schema first (recycle, don't rebuild)

- The whitelist is declarative: `{ path: ConfigPath, kind: 'preview' | 'commit' }`.
  All other fields are commit-only by default — explicit > implicit.
- Validators return `ValidationFinding[]`; tests assert that an invalid
  draft never partially applies (P4-AC-4 evidence).
- **Two-layer split (the spec's `demo-domain/config/schema.ts`
  filename is honoured at the engine layer):**
  - `demo-domain/config/` (NEW, cross-scenario engine): `ConfigPath`,
    `ValidationFinding`, `ConfigDraft` shape, the previewable-field
    whitelist schema TYPE per spec P4-FR-2 (`schema.ts`), and the
    generic schema-driven validator + diff framework. No pet-care
    knowledge here.
  - `demo-domain/scenarios/petCare/config/` (RECYCLED from legacy
    `speciesConfig.ts`): pet-care-specific schema INSTANCE
    (`schema.ts` declaring which fields are `preview` vs `commit`),
    validator rules, `applyOverride` — all plugged into the engine
    above.
- **Recycle from legacy `speciesConfig.ts`:** the existing
  `validateEditableConfig` already implements range checks, monotonic
  lifecycle ordering, and unknown-field rejection — port those rules
  verbatim into `scenarios/petCare/config/validate.ts` (translate the
  ad-hoc error strings into `ValidationFinding` codes per spec).
  `applyOverride` already handles the partial-edit merge — port it
  into `scenarios/petCare/config/applyOverride.ts` and add the test
  guarantee that an invalid draft never half-applies. The legacy
  `EditableSpeciesConfig` shape becomes the starting point for
  `NormalizedConfig` (rename + add `__brand` if needed).

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
- Planning-doc tracker table row for "JSON preview/commit" set to ✅
  shipped with every PR linked **in the same PR that ships each row**
  (use the GH-assigned PR number; never chase with a `docs: flip row`
  follow-up — see CLAUDE.md "Plan + doc updates ride with the PR that
  lands the work").

## Done log

- (none yet)
