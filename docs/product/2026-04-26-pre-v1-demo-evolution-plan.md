# Pre-v1 Demo Evolution Plan (Post-`develop` Refresh)

Plan date: 2026-04-26

## Purpose

This document defines the pre-v1 demo increment from the current `develop` baseline.

It records existing capabilities, in-scope outcomes, implementation constraints, acceptance criteria, risks, and delivery sequencing for a six-week track.

---

## Document set

This planning doc is the **what + why**. The shape lives in three companion documents:

| Doc | Path | Role |
|---|---|---|
| Design doc | [`docs/specs/2026-04-26-pre-v1-demo-evolution-design.md`](../specs/2026-04-26-pre-v1-demo-evolution-design.md) | Cross-cutting *how* — Vue/Pinia/Router architecture, DDD layering, cross-pillar contracts (`Scenario`, `WalkthroughStep`, `DiffMetric`, `RunFingerprint`, `ConfigDraft`), determinism fingerprint design, persistence contract. |
| Spec | [`docs/specs/2026-04-26-pre-v1-demo-evolution-spec.md`](../specs/2026-04-26-pre-v1-demo-evolution-spec.md) | Per-pillar *requirements* — FRs, data shapes, acceptance criteria, NFRs. |
| Plans | `docs/plans/2026-04-26-pre-v1-demo-*.md` (six files; see [Tracker table](#tracker-table)) | Per-pillar **roadmaps** — chunked PR slices, file targets, verification gates. |

### Issue #132 — umbrella tracker

The doc set originally landed via [PR #129](https://github.com/Luis85/agentonomous/pull/129) (squash-merged `b2f9342`); the umbrella tracker for the live increment is now [issue #132](https://github.com/Luis85/agentonomous/issues/132). The planning doc, design doc, spec, and the six per-pillar plans all live on `develop` — implementation lives in downstream PRs cut from `develop`.

Every downstream PR cut from this plan must:

- include the body line `Tracks: #132`,
- flip its row in the [Tracker table](#tracker-table) to `✅ shipped` with `[#NNN](url)` **in the same PR** (use the GH-assigned PR number — it is known the moment the PR is opened, before merge). Do NOT land at "in review" and chase with a `docs: flip row` follow-up — those pollute history. The row briefly reads "shipped" while the PR is still open; CI gates prevent a broken merge from leaving the row stale,
- get added as a row to the GitHub tasklist on issue #132's body so completion auto-flips on merge.

---

## Baseline snapshot (already present)

1. **Narrative-capable pet loop** with lifecycle, mood, random events, default + expressive skills.
2. **Decision trace panel** with needs/candidates/selection rendering and persisted visibility.
3. **Cognition mode switcher** with async probing, disabled-state messaging, race guards, and construct-failure handling.
4. **Seed controls** (`copy`, `new`, `replay`) and replay/reset hooks.
5. **JSON species config panel** with schema-like runtime validation and persisted override.
6. **Speed control + reset + export/import** with local-storage migration handling.
7. **Recent stabilization on cognition reset semantics** in core (`Reasoner.reset` behavior harmonization).

Implication: the next increment should prioritize **demo comprehension, comparability, trust proof, and productization**, not re-implement already-shipped primitives.

---

## Increment thesis

Deliver a “Demo v2” that can be shown publicly without narration and still communicate:

- what the agent is doing,
- why it chose that action,
- how cognition swaps alter behavior,
- why runs are reproducible,
- and how the same core extends beyond one toy scenario.

---

## Scope (single increment, all 5 in-scope areas)



## Product demo direction (explicit)

The **current `examples/product-demo` demo is the shippable product demo baseline** and remains the primary vehicle for this increment.

For this pre-v1 evolution, we are not replacing it with a different demo concept; we are expanding it into an **interactive website experience** that covers the demo intent end-to-end and showcases the library’s capabilities in a way that is explorable by first-time visitors.

This means roadmap work should upgrade and productize the existing pet-care surface (guided flow, explainability, determinism proof, cognition contrast, scenario breadth, integration story), then package that as a coherent interactive site experience.

---

## Demo application stack and architecture constraints

The product demo scope now requires a more robust application shell. The demo site implementation will standardize on:
The UI layer is explicitly **SFC-first** (`.vue` components), not string-template or render-function-first by default.


- **Vue 3 Single-File Components (SFCs)** for UI composition,
- **Vue Router** for multi-view demo navigation (guided flow, free-play, explainability views),
- **Pinia** for front-end application state orchestration.

**DDD applies to the demo as well.**

- Keep domain logic in the `agentonomous` domain/application layer (or dedicated demo-domain modules), not in Vue components.
- Treat Vue components as presentation/adapters; avoid embedding simulation rules in UI handlers.
- Route orchestration and Pinia stores should coordinate use-cases, not become a second domain model.
- Determinism-sensitive state transitions must remain command-driven and testable outside the component tree.

---

## Demo rename plan — shipped (Wave-0)

The demo workspace has been renamed to `examples/product-demo/` (Wave-0 preflight). Plan archived at [`docs/archive/plans/2026-04-26-pre-v1-demo-rename-preflight.md`](../archive/plans/2026-04-26-pre-v1-demo-rename-preflight.md).

### What landed

- Workspace folder renamed via `git mv` (history preserved).
- Root npm scripts (`demo:install`, `demo:dev`, `demo:build`) point at the new path; `npm run e2e` proxies into the demo workspace's Playwright entry.
- GitHub Pages workflow (`.github/workflows/pages.yml`) and CI workflow (`.github/workflows/ci.yml`) build + upload `examples/product-demo/dist`.
- ESLint forbidden-import + determinism rules (per the design's DDD layering) enforce the new layered subpaths so downstream pillar PRs fail CI on a violation.
- `examples/product-demo/playwright.config.ts` + empty `tests/e2e/` placeholder land here so all later pillar PRs can rely on `npm run e2e` exiting 0 from day 1.
- Top-level docs (`README.md`, `CLAUDE.md`, `PUBLISHING.md`) and every non-archived `docs/**` reference were swept in the same diff.
- Legacy `nurture-pet.*` and un-prefixed `demo.*` localStorage keys are purged on first load (per spec STO-3).

### Acceptance criteria (met)

- `npm run demo:dev` and `npm run demo:build` work against the renamed workspace.
- CI Pages workflow publishes from `examples/product-demo/dist` with no manual patching.
- No stale path references remain in tracked docs / scripts / workflows (verified by `git grep` excluding `.worktrees/` and `docs/archive/`).

---

## Pre-v1 policy (explicit)

This increment is intentionally **pre-v1**. We optimize for a clean architecture and demo clarity, not backwards compatibility.

- No compatibility shims required for old demo UX flows.
- No requirement to preserve previous local storage key shapes.
- No requirement to keep transitional APIs if a cleaner API exists.
- Determinism and testability remain non-negotiable; compatibility is negotiable.

## Legacy code recycling (cross-cutting)

"Pre-v1" does **not** mean "rewrite everything from scratch". The legacy
vanilla-TS demo on `develop` (post-Wave-0) contains a substantial body
of pure domain logic — species descriptor, cognition mode probes +
reasoner constructors + softmax helpers, skill, random-event defs,
config validator, SVG renderers — that is fully reusable under the new
Vue/Pinia/Router shell.

**Pillar-1 slice 1.2a** does the bulk of the salvage via `git mv`
(history preserved): `species.ts`, `constants.ts`, `cognition/**`,
`skills/**` move into `examples/product-demo/src/demo-domain/scenarios/petCare/`,
and a new `buildAgent.ts` factory extracts the random-event +
agent-construction recipe from the legacy `main.ts` verbatim.

**Pillar-1 slice 1.2b** ports the DOM-mount UI (`mountHud`,
`mountTraceView`) into Vue SFCs that reuse the legacy data tables
(`INTERACTION_BUTTONS`, `STAGE_LABELS`, `LIFETIME_COUNTERS`, per-need
bar markup) verbatim, then deletes the now-orphaned legacy mount files.

**Pillar 2** ports `cognitionSwitcher.ts` (46 KB) into
`<CognitionSwitcher>` + `useAgentSession.setMode()`, and the pure SVG
renderers (`lossSparkline.ts`, `predictionStrip.ts`) into thin Vue SFCs
that consume compute helpers extracted into `demo-domain/scenarios/petCare/cognition/`.

**Pillar 4** ports `speciesConfig.ts`'s `EditableSpeciesConfig` +
`validateEditableConfig` + `applyOverride` into
`demo-domain/scenarios/petCare/config/` (validator + apply rules
verbatim), and the `mountConfigPanel` mount becomes the `<JsonEditor>`
SFC family.

**Pillar 5 slice 5.2** is much lighter than originally scoped: the
pet-care modules already live under `demo-domain/scenarios/petCare/`
thanks to slice 1.2a, so 5.2 just wraps them in the design's
`Scenario` contract rather than relocating them.

The full per-module recycle map (with destination paths and timing)
lives in the design doc under `Legacy code recycling`; per-pillar
plans repeat the relevant rows in their `Pre-flight` and slice notes.

## 1) Guided walkthrough mode (from optional docs flow to in-product flow)

### Outcome
A first-time user reaches the core aha moments in 2–3 minutes without external guidance.

### Implementation
- Add a lightweight walkthrough controller (step graph + completion predicates).
- Introduce a “Start guided tour” CTA in the demo shell.
- Cover 5 chapters: autonomy, trace visibility, cognition switching, JSON tuning, deterministic replay.
- Use contextual highlights and one-line action prompts (no blocking modal wall).
- Persist completion state with “restart tour” affordance.

### Acceptance criteria
- Users can finish tour with zero dead-end states.
- Tour remains robust across reset/replay actions.
- Tour can be skipped/resumed without corrupting demo state.

### Risks / mitigations
- **Risk:** Tour logic drifts from UI changes.  
  **Mitigation:** selector constants + per-step smoke tests.

---

## 2) Cognition difference panel (switching is not enough; contrast is required)

### Outcome
Mode swaps show visible, structured deltas instead of requiring users to infer behavior from raw events.

### Implementation
- Add a “Behavior differences” card near trace.
- Track per-mode compact metrics over rolling windows:
  - top intention frequency,
  - skill invocation distribution,
  - average urgency gap between top-2 candidates,
  - interruption/reactivity markers.
- After each mode switch, render a short “what changed” summary over first N ticks.
- Keep expanded diagnostics collapsible.

### Acceptance criteria
- Every mode swap results in a visible delta statement within 1–3 ticks.
- No heavy DOM churn on each frame (update only on `AGENT_TICKED`).
- Missing optional peer modes still show graceful capability text.

### Risks / mitigations
- **Risk:** noisy metrics create false “differences.”  
  **Mitigation:** minimum sample windows + confidence labels.

---

## 3) Determinism proof artifact (controls → verifiable claim)

### Outcome
Replay determinism is demonstrated with explicit evidence, not implied by buttons.

### Implementation
- Generate a canonical run fingerprint for a bounded tick window.
- Scope fingerprint key by seed + scenario + cognition mode + config signature.
- Show status badge: `Matched`, `Diverged`, `Insufficient sample`.
- Add “copy replay report” action (seed, scope, fingerprint, verdict).
- Include one deterministic “known-good script” path for live demos.

### Acceptance criteria
- Same-scope replay reliably yields `Matched`.
- Scope changes (mode/config/scenario) correctly produce controlled divergence.
- Badge/report generation never mutates simulation state.

### Risks / mitigations
- **Risk:** false mismatch from unstable fields.  
  **Mitigation:** fingerprint from normalized deterministic fields only.

---

## 4) JSON tuning evolution (from restart-only to preview + commit model)

### Outcome
Users can experiment faster while keeping deterministic integrity explicit and testable.

### Implementation
- Replace the restart-only apply flow with a single pre-v1 model: live preview + explicit commit semantics.
- Add **Preview** pipeline for a strict subset of parameters:
  - need decay rates,
  - selected persona trait weights,
  - selected lifecycle thresholds (if monotonic constraints hold).
- Add explicit dual actions:
  - `Preview (session-only)`
  - `Commit + Restart (persisted)`
- Add diff summary (“before → after”) and inline reasoned validation errors.

### Acceptance criteria
- Preview can be applied/reverted without full page reload.
- Commit path is allowed to redefine persistence shape if it improves clarity for pre-v1.
- Invalid edits never partially apply.

### Risks / mitigations
- **Risk:** preview introduces inconsistent state edges.  
  **Mitigation:** whitelist-only previewable fields + full rollback on failure.

---

## 5) Second scenario slice (widen product narrative beyond pet-care loop)

### Outcome
Demonstrate that the agent core is reusable across interaction domains, not tied to one Tamagotchi-style loop.

### Implementation
- Add a second scenario (recommended: “Companion NPC micro-loop”).
- Reuse core controls where possible: trace, seed, mode switcher, speed.
- Introduce scenario-specific goals/skills and one distinct behavioral signature.
- Add scenario selector and per-scenario seed/config scoping.

### Acceptance criteria
- Second scenario launches from same demo shell.
- Determinism and explainability surfaces still function.
- Demo presenter can articulate “same core, different behavior surface” in <20s.

### Risks / mitigations
- **Risk:** scope explosion into game design.  
  **Mitigation:** keep scenario intentionally narrow; one strong loop only.

---

## Deferred follow-up: Excalibur multi-agent environment demo

Excalibur work is explicitly **out of scope for this increment** and deferred to a follow-up track.

### Deferral rationale
- This increment prioritizes the product demo shell, explainability, determinism proof, and scenario architecture.
- The Excalibur story is more valuable in a dedicated follow-up focused on **multiple interacting agents in a shared environment**.

### Follow-up intent (next track)
- Use Excalibur to demonstrate multi-agent embodiment in one environment.
- Focus on interaction behaviors between agents (not only single-agent UX polish).
- Define separate acceptance criteria for environment interactions and emergent outcomes.

---

## Delivery sequencing (6-week track)

### Wave A (Weeks 1–2): Comprehension + proof foundations
- Guided walkthrough skeleton.
- Behavior-diff baseline card.
- Determinism fingerprint core logic.

### Wave B (Weeks 3–4): Experimentation + breadth
- JSON preview/commit split.
- Second scenario MVP.
- Behavior-diff quality improvements.

### Wave C (Weeks 5–6): Productization + hardening
- Cross-cutting hardening and demo script stabilization.
- Replay report polish.
- Guided copy/tooltips/accessibility cleanup.
- Final demo script lock + soak stabilization.

---

## Workstreams and ownership

- **Product + UX**: tour language, progressive disclosure, scenario framing.
- **Demo frontend**: diff panel, replay badge/report, config preview UX.
- **Core integration**: deterministic fingerprint helpers, scenario scoping contracts.
- **QA**: deterministic replay checks, scenario parity checks, soak runs.

Weekly checkpoint questions:
1. Is first-time comprehension improving?
2. Are determinism claims demonstrably true in UI?
3. Are we adding complexity faster than clarity?

---

## Test and quality strategy

## Functional checks
- Guided-tour step progression (normal, skip, restart, reset mid-tour).
- Mode switch behavior differences for all available cognition modes.
- Replay badge verdict flows (matched/diverged/insufficient).
- Config preview apply/revert/commit flows.
- Scenario switching with scoped seed/config persistence.

## Determinism checks
- Repeated same-seed runs produce identical fingerprints under same scope.
- Intentional scope mutation (mode/config/scenario) yields divergence.
- No use of forbidden nondeterminism primitives in `src/` additions.

## Performance checks
- Trace/diff panels update only on agent tick events.
- No unbounded growth in in-memory metric buffers.
- 10-minute soak in each scenario without UI slowdown or listener leaks.

## Release gate
- `npm run verify` passes.
- Demo narrative A–E + scenario switch can be executed live without runtime errors.

---

## Definition of done (for this increment)

1. Guided walkthrough exists, is stable, and can be completed end-to-end.
2. Cognition switching produces understandable, visible difference output.
3. Determinism replay emits an explicit, shareable verdict artifact.
4. JSON tuning uses one clear pre-v1 model (preview + commit), with no legacy fallback path.
5. A second scenario is publicly runnable from the same shell.
6. No determinism or performance regressions under verify + soak checks.

---

## Tracker table

Canonical status. Update the **Status** and **PR** cells in the same diff that ships each downstream PR.

| Wave | Pillar | Plan | Status | PR |
|---|---|---|---|---|
| 0 | Demo rename preflight | [`rename-preflight`](../archive/plans/2026-04-26-pre-v1-demo-rename-preflight.md) (archived) | ✅ shipped | [#134](https://github.com/Luis85/agentonomous/pull/134) |
| A | Guided walkthrough | [`guided-walkthrough`](../plans/2026-04-26-pre-v1-demo-guided-walkthrough.md) | in progress | [#140](https://github.com/Luis85/agentonomous/pull/140) (slice 1.1) |
| A | Cognition diff panel | [`cognition-diff-panel`](../plans/2026-04-26-pre-v1-demo-cognition-diff-panel.md) | not started | — |
| A | Determinism fingerprint | [`determinism-fingerprint`](../plans/2026-04-26-pre-v1-demo-determinism-fingerprint.md) | not started | — |
| B | JSON preview / commit | [`json-preview-commit`](../plans/2026-04-26-pre-v1-demo-json-preview-commit.md) | not started | — |
| B-C | Second scenario | [`second-scenario`](../plans/2026-04-26-pre-v1-demo-second-scenario.md) | not started | — |

Status values: `not started` · `in progress` · `in review` · ✅ shipped.

---

## Milestone checklist

### M1 (end Week 2)
- [ ] Guided walkthrough skeleton merged ([plan](../plans/2026-04-26-pre-v1-demo-guided-walkthrough.md)).
- [ ] Behavior-diff baseline merged ([plan](../plans/2026-04-26-pre-v1-demo-cognition-diff-panel.md)).
- [ ] Fingerprint/verdict core merged ([plan](../plans/2026-04-26-pre-v1-demo-determinism-fingerprint.md)).

### M2 (end Week 4)
- [ ] JSON preview/commit split merged ([plan](../plans/2026-04-26-pre-v1-demo-json-preview-commit.md)).
- [ ] Second scenario MVP merged ([plan](../plans/2026-04-26-pre-v1-demo-second-scenario.md)).
- [ ] Diff panel confidence/quality improvements merged ([plan](../plans/2026-04-26-pre-v1-demo-cognition-diff-panel.md)).

### M3 (end Week 6)
- [ ] Replay report polish merged ([plan](../plans/2026-04-26-pre-v1-demo-determinism-fingerprint.md)).
- [ ] Final scripted demo rehearsal + soak signoff completed.
- [ ] Excalibur multi-agent follow-up brief drafted (separate track).
