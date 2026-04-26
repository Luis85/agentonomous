# Second scenario — pre-v1 demo evolution (Pillar 5)

Plan date: 2026-04-26
Wave: B → C
Tracker issue: [#132](https://github.com/Luis85/agentonomous/issues/132) — every PR cut from this plan must include `Tracks: #132` in its body. (Originating PR [#129](https://github.com/Luis85/agentonomous/pull/129) landed the doc set; the live tracker is now the issue.)
Companion docs:
- Planning doc: [`docs/product/2026-04-26-pre-v1-demo-evolution-plan.md`](../product/2026-04-26-pre-v1-demo-evolution-plan.md) → §5 Second scenario slice
- Design doc: [`docs/specs/2026-04-26-pre-v1-demo-evolution-design.md`](../specs/2026-04-26-pre-v1-demo-evolution-design.md) → Cross-pillar contracts → `Scenario`
- Spec: [`docs/specs/2026-04-26-pre-v1-demo-evolution-spec.md`](../specs/2026-04-26-pre-v1-demo-evolution-spec.md) → §P5

## Goal

Demonstrate the agent core extends beyond the pet-care loop by shipping
a `Scenario` contract, refactoring the existing nurture-pet logic into
a `pet-care` scenario, and adding `companion-npc` as the reference
second scenario.

## Pre-flight

- Blocked by: rename preflight.
- The `Scenario` interface is locked in the design doc. Concept of the
  `companion-npc` scenario is **OQ-P5** — settle in the kickoff for
  slice 5.3.
- Coordinate with **Pillar 3**: scenario id is part of the fingerprint
  scope key. Confirm `useFingerprintRecorder.beginWindow` accepts a
  scenario id by the time slice 5.2 lands.

## Roadmap

| # | Slice | Files | Spec FRs | Status | PR |
|---|---|---|---|---|---|
| 5.1 | `Scenario` contract + `useScenarioCatalog` domain store | `examples/product-demo/src/demo-domain/scenarios/{types.ts,catalog.ts}`, `examples/product-demo/src/stores/domain/useScenarioCatalog.ts`, `examples/product-demo/test/**` | P5-FR-1 | not started | — |
| 5.2 | Refactor nurture-pet into `pet-care` scenario (no behavioral change) + scenario selector UI + `/play/:scenarioId` route | `examples/product-demo/src/demo-domain/scenarios/petCare/{index.ts,skills.ts,config.ts}`, `examples/product-demo/src/components/shell/ScenarioSelector.vue`, `examples/product-demo/src/routes/index.ts` | P5-FR-2, P5-FR-4, P5-AC-1 | not started | — |
| 5.3 | `companion-npc` reference scenario implementation (concept-locked at kickoff) | `examples/product-demo/src/demo-domain/scenarios/companionNpc/{index.ts,skills.ts,config.ts}`, `examples/product-demo/test/demo-domain/scenarios/companionNpc.test.ts` | P5-FR-3, P5-AC-2 | not started | — |
| 5.4 | Per-scenario seed/config scoping + Playwright `scenario-swap.spec.ts` | `examples/product-demo/src/stores/domain/useScenarioCatalog.ts` (per-scenario persistence keys), `examples/product-demo/tests/e2e/scenario-swap.spec.ts` | P5-FR-5, P5-FR-6, P5-AC-3, P5-AC-4, P5-AC-5 | not started | — |

## Slice notes

### 5.1 — Contract first

- The `Scenario` interface lives in `demo-domain/scenarios/types.ts`
  exactly as defined in the design doc. No extensions per scenario;
  variation lives inside the implementation.
- `useScenarioCatalog` exposes `list()`, `activeId`, `setActive(id)`,
  and `getScopeKeyComponent()` so other domain stores can include the
  scenario id in their scope keys.

### 5.2 — Refactor without regression

- Move the existing nurture-pet skill registrations + species defaults
  into `demo-domain/scenarios/petCare/`. Behavior must not change;
  existing tests that reference the pet defaults are updated to import
  from the new path.
- The scenario selector UI lives in the shell header. Selecting
  triggers `useScenarioCatalog.setActive`, which navigates via the
  domain-store wrapper (per the design's "components do not call
  `router.push` directly" rule).

### 5.3 — Concept revisable at kickoff

- Before writing this slice, run a focused 30-min concept lock for
  `companion-npc`: needs (likely boredom + curiosity + a patrol-duty
  meter), skills (patrol, react-to-mood-broadcast, idle), behavioral
  signature (one distinct skill priority pattern that visibly differs
  from `pet-care`).
- Record the locked concept as a one-paragraph note in this plan's
  Done log so the PR description has a stable reference.

### 5.4 — Determinism gate

- Per-scenario persistence keys: `demo.v2.session.lastSeed.<scenarioId>`,
  `demo.v2.config.committed.<scenarioId>`. Switching scenarios does not
  leak the other scenario's state (P5-AC-3 evidence).
- Playwright `scenario-swap.spec.ts` runs a fixed swap pattern twice
  under the same seeds and asserts identical fingerprint verdicts in
  both runs.

## Verification gates

- `npm run verify` — green per slice.
- Existing nurture-pet tests pass after the slice 5.2 refactor with no
  behavioral diff.
- `npm run e2e -- scenario-swap` green after slice 5.4.

## Definition of done

- Spec criteria P5-AC-1 through P5-AC-5 all met.
- `companion-npc` locked concept recorded in Done log.
- Planning-doc tracker table row for "Second scenario" set to ✅
  shipped with every PR linked **in the same PR that ships each row**
  (use the GH-assigned PR number; never chase with a `docs: flip row`
  follow-up — see CLAUDE.md "Plan + doc updates ride with the PR that
  lands the work").

## Done log

- (none yet)
