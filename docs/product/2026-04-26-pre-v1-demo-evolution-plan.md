# Pre-v1 Demo Evolution Plan (Post-`develop` Refresh)

Plan date: 2026-04-26

## Purpose

This document defines the pre-v1 demo increment from the current `develop` baseline.

It records existing capabilities, in-scope outcomes, implementation constraints, acceptance criteria, risks, and delivery sequencing for a six-week track.

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

The **current `examples/nurture-pet` demo is the shippable product demo baseline** and remains the primary vehicle for this increment.

For this pre-v1 evolution, we are not replacing it with a different demo concept; we are expanding it into an **interactive website experience** that covers the demo intent end-to-end and showcases the library’s capabilities in a way that is explorable by first-time visitors.

This means roadmap work should upgrade and productize the existing nurture-pet surface (guided flow, explainability, determinism proof, cognition contrast, scenario breadth, integration story), then package that as a coherent interactive site experience.

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

## Demo rename plan (`examples/nurture-pet` → `examples/product-demo`)

This increment also includes renaming the demo workspace from `examples/nurture-pet` to `examples/product-demo`.

### Why this matters
- Naming must match product positioning (shippable product demo, not a side example).
- The demo is published on GitHub Pages, so path-sensitive build/deploy wiring must be updated in lockstep.

### Required implementation updates
- Rename workspace folder and update all repo references (`README`, `CLAUDE.md`, docs, scripts, tests).
- Update root npm scripts that currently shell into `examples/nurture-pet` (`demo:install`, `demo:dev`, `demo:build`).
- Update any test fixtures/import paths coupled to `examples/nurture-pet`.
- Update GitHub Pages workflow artifact path from `examples/nurture-pet/dist` to `examples/product-demo/dist`.
- Update `PUBLISHING.md` deployment instructions and verification steps to the new path/name.


### Documentation revisit/update mandate
- This rename and demo evolution requires an explicit **documentation sweep** in the same delivery window.
- Update top-level docs first: `README.md`, `CLAUDE.md`, `PUBLISHING.md`, and demo-facing docs under `docs/`.
- Replace stale `examples/nurture-pet` references with `examples/product-demo` and re-validate commands/snippets.
- Treat docs updates as release-blocking for the rename slice; rename is not considered done until docs are updated and verified.

### GitHub Pages implications / release controls
- Treat the rename + Pages workflow path update as one atomic delivery slice (no split merge).
- Add a pre-merge dry run gate: build demo, confirm artifact upload path, confirm Pages deploy job resolves expected folder.
- Require one explicit post-merge verification on the `demo` branch to ensure public URL serves the renamed workspace build.
- If deploy fails, rollback by reverting the rename commit set as a unit (folder + scripts + workflow + docs).

### Acceptance criteria
- `npm run demo:dev` and `npm run demo:build` work with `examples/product-demo`.
- CI Pages workflow publishes from `examples/product-demo/dist` with no manual patching.
- No stale `examples/nurture-pet` path references remain in tracked docs/scripts/workflows.

---

## Pre-v1 policy (explicit)

This increment is intentionally **pre-v1**. We optimize for a clean architecture and demo clarity, not backwards compatibility.

- No compatibility shims required for old demo UX flows.
- No requirement to preserve previous local storage key shapes.
- No requirement to keep transitional APIs if a cleaner API exists.
- Determinism and testability remain non-negotiable; compatibility is negotiable.

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

## Milestone checklist

### M1 (end Week 2)
- [ ] Guided walkthrough skeleton merged.
- [ ] Behavior-diff baseline merged.
- [ ] Fingerprint/verdict core merged.

### M2 (end Week 4)
- [ ] JSON preview/commit split merged.
- [ ] Second scenario MVP merged.
- [ ] Diff panel confidence/quality improvements merged.

### M3 (end Week 6)
- [ ] Replay report polish merged.
- [ ] Final scripted demo rehearsal + soak signoff completed.
- [ ] Excalibur multi-agent follow-up brief drafted (separate track).
