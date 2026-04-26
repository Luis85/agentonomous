# agentonomous — MVP demo spec

> Companion to [`docs/specs/vision.md`](./vision.md).
> This document defines the public MVP demo scope: what we show, what we skip,
> and how we keep the story clear. Draft — iterated on throughout Phase A.
>
> **Status (2026-04-26):** chapters A–E (the 3-minute narrative below) are
> all live in `examples/nurture-pet/`. Active polish work — explainability
> HUD, learning-mode UX, prediction strip, backend picker — is tracked in
> `docs/plans/2026-04-25-comprehensive-polish-and-harden.md`. Phase 1 / 2 /
> 3 (foundation / explainability / public polish) below describe the
> _design_ trajectory; per-feature ship dates live in git history (PR
> numbers in the comprehensive plan).

## Purpose

The current Tamagotchi-style demo proves feasibility, but it is not yet focused
or polished enough for a public first impression. The MVP demo should show the
core product promise in under three minutes:

1. The agent acts autonomously.
2. Decisions are explainable (not a black box).
3. Cognition modules are swappable.
4. Behavior is data-driven via JSON.
5. Runs are reproducible under a fixed seed.

## Demo goals

### Primary goals

- **Clarity:** a visitor understands the value in under 30 seconds.
- **Trust:** every visible action can be traced to a decision path.
- **Extensibility:** cognition is shown as plug-in modules, not hard-wired logic.
- **Shareability:** the demo runs via a public link with zero local setup.

### Non-goals (MVP)

- Multiplayer networking.
- Large world simulation or pathfinding showcase.
- Full narrative game loop.
- Advanced authoring tools.
- High-fidelity art polish as a release gate.

## Audience

- **Indie game developers:** "How fast can I get a believable autonomous NPC?"
- **AI/agent builders:** "Can I plug in my own reasoning stack?"
- **Technical evaluators:** "Is this deterministic and debuggable?"

## Demo narrative (3 minutes)

### A) Living agent (0:00–0:45)

- Start with one agent in a small habitat.
- Needs decay over time (for example: hunger, energy, hygiene, social).
- Agent chooses an action autonomously.
- HUD displays a short decision reason.

**Aha moment:** autonomy without hand-scripting every state transition.

### B) Why this action? (0:45–1:30)

- Open the Decision Trace panel.
- Show per-tick need values, candidate intentions, and selected skill.
- Show the reasoning chain in compact form.

**Aha moment:** behavior is explainable and inspectable.

### C) Same world, different cognition (1:30–2:15)

- Switch cognition mode with a dropdown:
  - default heuristic mode
  - behavior-tree adapter mode
  - BDI-style adapter mode
  - optional learning/bias adapter mode
- Environment remains unchanged; only cognition changes.
- Surface behavioral differences side-by-side.

**Aha moment:** cognition is modular and swappable.

### D) JSON-first configuration (2:15–2:45)

- Open a species/persona JSON panel.
- Edit one visible parameter (for example a decay rate).
- Apply and observe immediate behavioral impact.

**Aha moment:** behavior tuning is data-driven.

### E) Determinism check (2:45–3:00)

- Show current seed.
- Replay with the same seed and confirm matching trace.
- Reset with a new seed and show expected divergence.

**Aha moment:** reproducibility supports debugging and experiments.

## MVP scope

### In scope

1. Single-agent scene.
2. Three to five needs.
3. Existing default skills (for example feed / play / rest / clean).
4. Decision Trace panel with:
   - need snapshot
   - candidate intentions + scores
   - selected action
5. Cognition switcher with capability states:
   - available
   - optional module missing
6. JSON config panel (read, edit small subset, apply).
7. Seed controls (replay same seed / reset new seed).
8. Minimal event log (mood changes, skill execution, critical needs).

### Out of scope (later)

- Multi-agent social dynamics.
- Natural-language interaction layer.
- Save-slot management UI.
- Deep accessibility audit.
- Mobile-first optimization.

## UX principles

- **One-screen mental model:** simulation left, explainability right.
- **No hidden magic:** visible actions map to visible trace records.
- **Progressive disclosure:** basic view by default, advanced detail on demand.
- **Fast feedback:** user interactions should feel immediate.

## Demo architecture

### Layers

1. **Simulation layer**
   - agent creation
   - tick loop / step controls
   - seeded RNG + clock control
2. **Adapter layer**
   - cognition adapter factory
   - capability checks for optional modules
3. **Presentation layer**
   - world HUD
   - trace panel
   - cognition switcher
   - JSON config panel

### Integration constraints

- Keep core logic engine-agnostic.
- Keep cognition and explainability logic outside renderer-specific code.

## Definition of done

The MVP demo is done when all items below pass:

1. Narrative chapters A–E can be completed in one uninterrupted session.
2. Same-seed replay yields the same trace output.
3. At least two cognition modes show visibly different behavior.
4. At least one JSON parameter causes a visible behavior change.
5. No runtime errors during a 10-minute soak run.

## Success metrics

### Quantitative

- Time-to-first-aha under 30 seconds in moderated sessions.
- At least 60% of viewers open Decision Trace.
- At least 40% of viewers switch cognition mode.
- At least 25% of viewers run same-seed replay.

### Qualitative

Users can explain:

- why the agent performed its latest action
- how to swap cognition strategy

## Delivery plan

### Phase 1 — Foundation

- Stabilize scene, HUD, and deterministic controls.
- Stabilize trace data contract.
- Add seed controls.

### Phase 2 — Explainability and modular cognition

- Improve trace panel readability.
- Add cognition switcher with missing-module states.
- Add lightweight behavior-difference view.

### Phase 3 — Public polish

- Add JSON edit/apply flow.
- Add guided hints/tooltips.
- Harden performance and error handling.

## Risks and mitigations

- **Risk:** optional cognition modules are not demo-ready.
  **Mitigation:** fallback demo adapters with clear labels.
- **Risk:** too much information overwhelms first-time users.
  **Mitigation:** minimal default UI and opt-in advanced panels.
- **Risk:** UI side effects break determinism guarantees.
  **Mitigation:** keep presentation layer read-only and state changes command-driven.

## Open questions

1. Should default mode be guided walkthrough or free-form playground?
2. Which two cognition modes are most stable for first public release?
3. Which JSON parameters provide the strongest visible effect with low risk?

## Short scope statement

"The MVP demo shows, in under three minutes, an autonomous agent with
explainable decisions, swappable cognition modules, JSON-driven behavior tuning,
and deterministic seed replay."
