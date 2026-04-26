> **Archived 2026-04-26.** Completed across #7 / #8 / #9 / #13.

# MVP demo roadmap

> **Status: superseded by [[v1-comprehensive-plan]] (2026-04-19).**
> Sequencing for the demo closeout now lives in the 0.9.0 train of the
> v1 plan. Kept for historical context; do not plan against this file.

Session handoff + sequencing plan for the rescoped MVP demo defined in
[`docs/specs/mvp-demo.md`](../../docs/specs/mvp-demo.md). Supersedes
[`pre-v1-next-session.md`](./pre-v1-next-session.md) (its P1/P2/P3 all
shipped; its D-table is partially closed and the rest is folded in
below).

## Status recap — what shipped since the last handoff

| From previous plan                      | Status | Landed in                                               |
| --------------------------------------- | ------ | ------------------------------------------------------- |
| P1 snapshot × `setTimeScale`            | ✅     | PR #7 (`fix/snapshot-persist-timescale`)                |
| P2 pause freeze reconciliation          | ✅     | PR #8 (Option A; see `pause-semantics.md`)              |
| P3 demo export / import snapshot        | ✅     | PR #9                                                   |
| Branch-flow hygiene (one-PR-one-branch) | ✅     | PRs #10, #11, #12                                       |
| v1 release-candidate pipeline           | ✅     | PR #13 (`size-limit`, `release-candidate.yml`, runbook) |
| Pages demo decoupled from `main`        | ✅     | PRs #11, #12, #14 (`demo` long-lived branch)            |

Everything above is on `develop` and mirrored onto `demo`. `main` is
still untouched — first merge to `main` triggers v1.0.0 (runbook in
`PUBLISHING.md`).

## Status recap — MVP demo gap analysis

Chapter-by-chapter against the new spec:

| Chapter                | What the spec demands                                | Current state                                                                        | Gap        |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------- |
| A — Living agent       | Single agent, needs decay, HUD reason                | Habitat + HUD in place; decay rates mis-calibrated (see P0)                          | small      |
| B — Why this action?   | Decision Trace panel (needs + candidates + selected) | `DecisionTrace` emitted by core; no UI panel                                         | **medium** |
| C — Cognition switcher | Heuristic / BT / BDI / learning adapter, live swap   | Heuristic (`UrgencyReasoner`) only; Mistreevous BT / JS-son BDI / brain.js not wired | **large**  |
| D — JSON config panel  | Read + edit + apply species/persona JSON             | `species.ts` hard-codes config; no UI                                                | **medium** |
| E — Determinism check  | Seed display + replay vs new-seed split              | `SeededRng` used internally; no seed UI or replay control                            | **medium** |

Plus the always-on chrome the spec implies: minimal event log, capability
states on the cognition switcher, progressive disclosure between "basic"
and "advanced" views.

## Status recap — D-items from `pre-v1-next-session.md`

| ID  | Description                                                | Status                                                     |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| D1  | Expose `getTimeScale()` on `AgentFacade`                   | 🔴 open                                                    |
| D2  | Determinism proof: parallel-agent byte-identical trace     | 🔴 open                                                    |
| D3  | `Modifier.visual.label?` (human name vs id)                | 🔴 open                                                    |
| D4  | `localStorage` key prefix inconsistency (`whiskers:speed`) | 🔴 open                                                    |
| D5  | Speed-picker visual hierarchy vs critical-need flash       | 🔴 open                                                    |
| D6  | Dead `#pet-age` div                                        | 🔴 open                                                    |
| D7  | `formatRemaining` vs `formatAge` spacing inconsistency     | 🔴 open                                                    |
| D8  | R-08 per-subsystem snapshot versioning                     | ⏸ post-v1                                                  |
| D9  | Bundle-size trim (`dist/index.js`)                         | 🟢 gated by `size-limit` (35 kB budget; currently 30.2 kB) |
| D10 | Persona traits modifying need decay                        | ⏸ post-v1                                                  |

## Priorities for the MVP demo sprint

Ordered by "biggest user-visible improvement per line of code". Each
item is one PR unless noted.

### P0 — Need-decay calibration (immediate UX blocker)

**Problem.** `examples/nurture-pet/src/species.ts` sets hunger decay
to `0.006 / virtual sec` with `timeScale: 60`. That's `0.36 / wall
sec` — a full pet goes from 1.0 → critical (0.3) in ~2 wall seconds.
Even `0.5×` (timeScale 30) burns down in ~4 s. The spec's "chapter A,
0:45 of autonomy" is impossible to observe when the agent is
constantly in critical-need panic.

**Fix (smallest viable):**

1. Drop the demo default `timeScale` from 60 to ~10 so 1 wall sec = 10
   virtual sec. (Or keep rates the same and document the pacing.)
2. Soften the decay rates proportionally so chapter A reads as a
   calm "watch the agent live" — target: hunger reaches critical in
   ~45 s of wall time on the default speed.
3. Keep the speed picker (`Pause / 0.5× / 1× / 2× / 4× / 8×`) but
   re-center "1×" on the new rates.
4. Sanity: re-run determinism snapshot tests that depend on
   `catSpecies` constants; update expected traces if the rates land
   differently.

Library change? **No** — all knobs already live in the species
descriptor and `timeScale` is mutable. Demo-only PR.

**Follow-up (same or next PR):** expose a tiny "pace" developer
slider in the demo so future tuning doesn't need a code change.
This is the Chapter-D on-ramp — see P3.

### P1 — Decision Trace panel (Chapter B)

**Scope.** A right-hand panel that subscribes to the agent's
`DecisionTrace` stream and renders, for the most recent tick:

- Need snapshot (all 5 needs + urgency).
- Candidate intentions (`IntentionCandidate[]`) with their scores.
- Selected action (skill id + args).
- A one-line "why" reason — reuse the existing reason string if the
  reasoner emits one; otherwise derive from highest-urgency need.

**Constraints.** Presentation-only. No library change. The trace
contract (`src/agent/DecisionTrace.ts`) is already stable. Reads via
the same event bus the rest of the demo uses.

**Deliverables.**

- `examples/nurture-pet/src/traceView.ts` — pure DOM renderer.
- Wire-up in `main.ts`.
- Hide behind a "Decision Trace" toggle per the progressive-disclosure
  UX principle.

### P2 — Seed controls + determinism proof (Chapter E + D2)

**Scope.** Two UI additions + one test:

- Seed display (read-only) + "Copy seed" button.
- "Reset with new seed" and "Replay this seed" buttons (the latter
  resets the agent with the _same_ seed and snapshot restore).
- D2 integration test: spawn two agents with identical seeds, step
  them in lock-step, assert byte-identical `DecisionTrace` sequences.

**Risk.** The demo's `localStorage` snapshot needs to carry the seed
if "Replay this seed" is to survive a reload. Snapshot schema already
carries RNG state via `seed`/`cursor`; confirm and surface.

### P3 — JSON config panel (Chapter D)

**Scope.** A "Config" panel showing the species descriptor as
editable JSON. On apply:

1. Validate with the existing `defineSpecies` typeguard.
2. Rebuild the agent with the new descriptor (deliberate reset — the
   spec is fine with "apply and observe").
3. Surface validation errors inline.

Editable subset for the first cut: `needs[].decayPerSec`,
`persona.traits.*`, `lifecycle.schedule[].atSeconds`. Everything else
read-only for v1 demo.

Ties in with P0 — the need-decay sliders in the HUD _are_ a small
surface of this panel.

### P4 — Cognition switcher (Chapter C)

**Scope.** The largest of the batch and the last to land. Surface
the existing reasoning adapters as a dropdown:

- **Heuristic** (default, `UrgencyReasoner`).
- **Behavior tree** (`mistreevous` optional peer).
- **BDI** (`js-son-agent` optional peer).
- **Learning bias** (`brain.js` optional peer).

Each option has a capability state:

- **Available** — the peer is installed and the adapter loads.
- **Missing module** — render the option but disabled with a
  "Install `mistreevous` to enable" tooltip.

**Library work needed.**

- `src/cognition/adapters/mistreevous/` — new. Converts
  `IntentionCandidate` → BT node selection → action.
- `src/cognition/adapters/js-son/` — new. BDI beliefs/desires/
  intentions mapped to agent state.
- `src/cognition/adapters/brainjs/` — new. A tiny trained network that
  biases scores (not a full learner; enough to show visibly different
  behavior).
- `Agent.setReasoner(reasoner)` — live-swap without re-constructing.

**Risk.** Big. Splitting into 4 PRs (one per adapter + one for
`setReasoner`) is probably correct. Land behind a feature flag until
all four report "available" in the demo.

**Changeset required** (minor bump) for each adapter.

### Small cleanup PRs (can interleave, ~1 file each)

- **D1** `getTimeScale()` on `AgentFacade`.
- **D3** Add `Modifier.visual.label?` field; map in demo modifier tray.
- **D4** Rename `whiskers:speed` → `agentonomous/speed` for prefix
  consistency. Migration read once.
- **D5** Speed-picker style: move below bars or reduce visual weight.
- **D6** Delete dead `#pet-age` div in `index.html`.
- **D7** Align `formatRemaining` / `formatAge` spacing.

Any of these can ride along with a larger PR whose diff touches the
same file, per the one-PR-one-branch rule's "genuinely dependent"
exception.

## Sequencing suggestion

Week 1 — **P0** (needs calibration, urgent), **D6 / D7 / D4** cleanup.
Week 2 — **P1** (Decision Trace panel), **D1**.
Week 3 — **P2** (seed controls + D2 integration test), **D3**.
Week 4 — **P3** (JSON config).
Week 5+ — **P4** (cognition adapters, one PR each).

**MVP demo is complete** only when all five spec DoD items pass —
which requires P0 + P1 + P2 + P3 + P4 all live on `demo`. Don't
declare the rescoped demo done before Chapter C (cognition
switcher) and Chapter D (JSON config) are behaviorally visible.

**v1.0.0 npm release** is a separate call from MVP-demo-complete.
Two reasonable paths:

- **Release with the demo.** Cut v1.0.0 once P0–P4 are live on
  `demo` and the full 3-minute narrative works end-to-end. Cleanest
  marketing story; the public demo delivers the full spec promise
  on day one.
- **Release earlier.** Cut v1.0.0 once the library API surface is
  stable (realistically after P2, when the `DecisionTrace` contract
  and seed exposure are in public use). Demo continues iterating on
  `demo` branch under v1.0.x patch / v1.1 minor bumps. Picks up
  npm install traffic sooner at the cost of shipping the public
  demo without Chapters C and D.

Pick deliberately. The first path is the default unless there's a
specific reason (inbound interest, ecosystem pressure) to cut
sooner.

## Out of scope for this iteration

- **D8** R-08 snapshot versioning — design note first, separate cycle.
- **D10** persona-trait-driven decay rates — post-v1.
- Everything in the spec's "Non-goals" list (multiplayer, full
  narrative loop, mobile-first, accessibility audit).

## Hard constraints (unchanged)

- `npm run verify` green before any PR merges.
- Determinism: no `Date.now()` / `Math.random()` / `setTimeout` in
  `src/`. Use `WallClock`, `Rng`, ports. ESLint enforces.
- No scope creep: library PRs don't touch demo; demo PRs don't touch
  lib (except where P3/P4 explicitly say so).
- Branch flow: one PR per topic branch from `develop`. `main` /
  `develop` / `demo` are push-denied.

## Open questions flagged to the spec

The spec's "Open questions" section (1-3) stays open. Suggested
defaults to act on unless the answers change:

1. Default mode → **free-form playground**. A guided walkthrough can
   ride on top via tooltips (P3 scope).
2. First public cognition modes → **Heuristic + BT (mistreevous)**.
   BDI and learning ride in as capability-gated follow-ups.
3. Strongest low-risk JSON parameters → **`decayPerSec`** and
   **`persona.traits.playfulness`**. Both produce immediately
   visible behavior within the same tick.
