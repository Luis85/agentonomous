# Pre-v1 Demo Evolution — Specification

Spec date: 2026-04-26
Tracker PR: [#129](https://github.com/Luis85/agentonomous/pull/129)
Companion docs:
- Planning doc: [`docs/product/2026-04-26-pre-v1-demo-evolution-plan.md`](../product/2026-04-26-pre-v1-demo-evolution-plan.md)
- Design doc: [`2026-04-26-pre-v1-demo-evolution-design.md`](./2026-04-26-pre-v1-demo-evolution-design.md)
- Plans: see [Tracker table](../product/2026-04-26-pre-v1-demo-evolution-plan.md#tracker-table)

This spec defines the **testable requirements** for the pre-v1 demo
evolution increment. The planning doc fixes the *what* and the *why*; the
design doc fixes the *how* (architecture, layering, contracts); this
spec fixes the *what must be true when each pillar ships*.

## Pre-v1 policy reminder

This increment is intentionally pre-v1. The spec assumes:

- No compatibility shims for old demo flows.
- No requirement to preserve previous local-storage key shapes.
- No requirement to keep transitional APIs if a cleaner one exists.
- Determinism and testability remain non-negotiable.

Any acceptance criterion below that conflicts with the above is the
acceptance criterion's bug, not the policy's.

## Increment-wide acceptance

The increment is "done" when **all** of:

- IAC-1. The demo workspace is renamed to `examples/product-demo`; no
  `examples/nurture-pet` references remain in tracked files (docs,
  scripts, workflows, tests).
- IAC-2. `npm run demo:dev` and `npm run demo:build` succeed against
  `examples/product-demo`; the GitHub Pages workflow publishes from
  `examples/product-demo/dist`.
- IAC-3. All five pillars' acceptance criteria (P1-AC, P2-AC, …, P5-AC
  below) are met against the renamed workspace.
- IAC-4. The route map in the design doc is fully wired; every route
  renders without console errors.
- IAC-5. The DDD forbidden-import table in the design doc is enforced
  by ESLint; CI fails on a violation.
- IAC-6. `npm run verify` passes; `npm run e2e` (Playwright) passes on
  the three named scripts.
- IAC-7. The 10-minute soak in each scenario produces no UI slowdown,
  no listener leaks, and no determinism regressions.
- IAC-8. The planning doc's tracker table reflects every pillar's PR(s)
  and its current status.

## P1 — Guided walkthrough mode

### Outcome

A first-time visitor reaches the core "aha" moments in 2-3 minutes
without any external narration.

### Functional requirements

- **P1-FR-1.** The demo shell renders a "Start guided tour" CTA on `/`
  and on `/play` when the tour has never been completed; the CTA
  relabels to "Restart guided tour" once `useTourProgress.completedAt`
  is set.
- **P1-FR-2.** The tour comprises **five chapters**, each scoped to one
  comprehension goal:
  1. **Autonomy** — the agent acts without user input.
  2. **Trace visibility** — the user can read why each action was chosen.
  3. **Cognition switching** — switching modes changes behavior.
  4. **JSON tuning** — the user can preview a config edit.
  5. **Deterministic replay** — the same seed produces the same run.
- **P1-FR-3.** Each chapter is composed of one or more `WalkthroughStep`s
  (per design contract). Each step has a `completionPredicate` that
  observes `AgentSessionSnapshot` + `RouteContext` and returns `true`
  when the user has performed the step's action.
- **P1-FR-4.** Steps highlight UI via a logical `SelectorHandle` lookup
  (per design); changing markup that does not update the registry MUST
  surface a build-time TypeScript error, not a runtime crash.
- **P1-FR-5.** A skip control advances past the current step; a restart
  control returns to step 1 of chapter 1 and clears
  `useTourProgress.completedAt`.
- **P1-FR-6.** The current step is reflected in the URL as `/tour/:step`;
  reloading the page resumes the same step.
- **P1-FR-7.** Reset / replay actions invoked **inside** the tour MUST
  preserve tour position; they reset only the simulation, not
  `useTourProgress`.
- **P1-FR-8.** The tour MUST NOT use a blocking modal wall; highlights
  + one-line action prompts only.

### Data shapes

```ts
type WalkthroughStepId = string & { readonly __brand: 'WalkthroughStepId' };

type TourProgress = {
  readonly lastStep: WalkthroughStepId;
  readonly completedAt: number | null;   // virtual-tick count, not wall clock
  readonly skipped: ReadonlyArray<WalkthroughStepId>;
};
```

### Acceptance criteria

- **P1-AC-1.** Given a fresh browser profile, when the user clicks
  "Start guided tour", they reach an end-of-tour screen within ≤ 25
  user actions and without seeing a dead-end UI state.
- **P1-AC-2.** Given the tour is active, when the user reloads the page,
  the tour resumes on the same step with the same scenario and seed.
- **P1-AC-3.** Given the tour is active, when the user clicks "Reset",
  the simulation resets but the tour cursor remains on the current step.
- **P1-AC-4.** Given the tour is active, when the user clicks "Skip",
  the cursor advances to the next step and the skipped step appears in
  `TourProgress.skipped`.
- **P1-AC-5.** The Playwright `tour-happy-path.spec.ts` passes on every
  CI run.

### Out of scope (P1)

- Multi-language tour copy (English-only this increment).
- Mobile / touch-first tour layout.
- Voice narration / video.

### Dependencies on other pillars

- None inbound. P1 reads `useAgentSession` snapshots and depends on
  `useScenarioCatalog.activeId` resolving to a valid scenario, both of
  which exist independently of P5.

## P2 — Cognition difference panel

### Outcome

After a cognition mode swap, the demo renders structured behavioral
deltas instead of requiring users to infer behavior from raw events.

### Functional requirements

- **P2-FR-1.** The demo ships **four** rolling-window metrics
  implementing `DiffMetric<T>`:
  1. **Top-intention frequency** — the most-frequent intention id over
     the window.
  2. **Skill-invocation distribution** — proportion of ticks per skill id.
  3. **Urgency-gap mean** — mean of (top urgency − second-top urgency)
     across selection events.
  4. **Interruption / reactivity markers** — count of selection-id
     changes per tick where the previous selection was mid-execution.
- **P2-FR-2.** Each metric has a declared `windowTicks` (initial: 200)
  and `minSampleSize` (initial: 30). Below `minSampleSize`, the metric
  reports `confidence: 'low'` and the panel renders a "Gathering data"
  state instead of a difference statement.
- **P2-FR-3.** On a cognition mode swap, the panel renders a "What
  changed" summary within ≤ 3 ticks of post-swap data: each metric
  shows its old vs new value side-by-side with a visual delta cue.
- **P2-FR-4.** The panel updates **only** on `AGENT_TICKED` events;
  no `requestAnimationFrame` polling, no per-frame DOM churn.
- **P2-FR-5.** If a cognition mode is unavailable (peer module absent),
  the panel renders "Mode `<id>` not available" with the affected
  capabilities listed; it does not crash or render stale deltas.
- **P2-FR-6.** Expanded diagnostics (per-tick metric history) are
  collapsible behind a single toggle; collapsed is the default.

### Data shapes

```ts
type DiffMetricSnapshot<T> = {
  readonly metricId: DiffMetricId;
  readonly value: T;
  readonly sampleSize: number;
  readonly confidence: 'low' | 'medium' | 'high';
  readonly tickRange: { readonly fromTick: number; readonly toTick: number };
};
```

### Acceptance criteria

- **P2-AC-1.** Given the agent has run for ≥ 30 ticks in mode A, when
  the user switches to mode B, then within ≤ 3 ticks of post-swap data
  every metric panel shows a visible delta statement.
- **P2-AC-2.** Given the agent has run for < 30 ticks in mode B, all
  metric panels show "Gathering data" rather than a misleading delta.
- **P2-AC-3.** Given an unavailable cognition mode is selected, the
  panel surfaces the unavailability message and the rest of the demo
  remains responsive.
- **P2-AC-4.** Given the panel is open during a 10-minute soak, its
  metric ring buffers MUST NOT grow beyond `windowTicks` entries each.

### Out of scope (P2)

- Mode-comparison heatmaps or other dense visualizations.
- Cross-scenario diffing.
- Per-skill latency profiling.

### Dependencies on other pillars

- Reads `useAgentSession` events.
- Indirectly affected by **P3** (fingerprint scope key includes mode id;
  swapping modes inside an active fingerprint window resets the window).

## P3 — Determinism fingerprint

### Outcome

Replay determinism is demonstrated with explicit, copyable evidence
rather than implied by the existence of a "Replay" button.

### Functional requirements

- **P3-FR-1.** A `useFingerprintRecorder` domain store maintains a
  rolling fingerprint window over the last `windowTicks` ticks (initial:
  300) of the active session. The hash function and normalized inputs
  are exactly as defined in the design doc.
- **P3-FR-2.** A `<FingerprintBadge>` component renders one of three
  verdicts: `Matched`, `Diverged`, `Insufficient sample`. The badge is
  colored, labeled, and has an ARIA label restating the verdict.
- **P3-FR-3.** A `<ReplayReport>` panel renders the full
  `FingerprintScope` (seed, scenario id, mode id, config hash, window),
  the digest, the verdict, and a "Copy replay report" action that
  copies a single Markdown block to the clipboard.
- **P3-FR-4.** A scope key with no recorded `knownGoodDigest` records
  the current digest as the new known-good and reports `Matched`. This
  is what makes the very first run of a freshly-scoped session pass.
- **P3-FR-5.** Changing seed, scenario id, mode id, or committed config
  invalidates the prior `knownGoodDigest` for the new scope key only;
  the prior key's digest is retained.
- **P3-FR-6.** Generating the badge or report MUST NOT mutate the
  session, the agent, or any persisted state outside
  `demo.v2.fingerprint.knownGood`.
- **P3-FR-7.** A "known-good script" (a deterministic sequence of user
  actions) is bundled in `demo-domain/fingerprint/knownGoodScripts.ts`
  and runs end-to-end during the Playwright `replay-determinism.spec.ts`.

### Data shapes

The contract types (`FingerprintScope`, `FingerprintScopeKey`,
`RunFingerprint`) are defined in the design doc and reused verbatim.

The replay report Markdown shape:

```md
**Replay report — agentonomous demo**

| Field | Value |
|---|---|
| Seed | `<n>` |
| Scenario | `<scenarioId>` |
| Cognition mode | `<modeId>` |
| Config hash | `<sha256-truncated>` |
| Window ticks | `<n>` |
| Digest | `<sha256-truncated>` |
| Verdict | `<matched|diverged|insufficient-sample>` |
```

### Acceptance criteria

- **P3-AC-1.** Given a same-scope replay, the badge reaches `Matched`
  within `windowTicks` ticks every time.
- **P3-AC-2.** Given a scope mutation (mode swap, scenario swap, config
  commit), the badge transitions through `Insufficient sample` and ends
  on `Matched` against the **new** scope's known-good (or sets a new
  known-good if none exists).
- **P3-AC-3.** Given a deliberately introduced nondeterminism (e.g., a
  test-only override that injects `Math.random()` into a need policy),
  the badge reaches `Diverged` within `windowTicks` ticks.
- **P3-AC-4.** Clicking "Copy replay report" places a clipboard-readable
  Markdown block matching the shape above.
- **P3-AC-5.** The Playwright `replay-determinism.spec.ts` script passes
  on every CI run.

### Out of scope (P3)

- Cryptographic signing of replay reports.
- Server-side fingerprint upload / sharing.
- Diffing two diverged digests at the field level (manual investigation
  for now).

### Dependencies on other pillars

- Scope key consumes `useScenarioCatalog.activeId` (**P5**) and the
  cognition mode id surfaced via `useAgentSession`.
- Used by **P1** chapter 5 (deterministic replay) as the visible proof.

## P4 — JSON tuning: preview + commit

### Outcome

Users can experiment with config edits faster while keeping deterministic
integrity explicit and testable. The legacy "restart-only apply" flow is
**removed** (per pre-v1 policy).

### Functional requirements

- **P4-FR-1.** A `useConfigDraft` domain store holds the in-flight draft
  and exposes `preview()`, `revert()`, and `commit()` actions per the
  design contract.
- **P4-FR-2.** The set of **previewable fields** is whitelisted in
  `demo-domain/config/schema.ts`. The initial whitelist:
  - need decay rates (per need id),
  - selected persona trait weights,
  - lifecycle thresholds **only** when monotonic constraints hold.
  All other editable fields are commit-only.
- **P4-FR-3.** The editor view exposes two distinct actions:
  - **Preview (session-only)** — applies the draft to the live session
    without persisting; reversible via `revert()`.
  - **Commit + Restart (persisted)** — persists the draft to
    `demo.v2.config.committed.<activeScenarioId>`, restarts the
    session, and triggers a fresh fingerprint window.
- **P4-FR-4.** A diff summary renders before/after values for every
  changed field. Invalid edits surface inline with the failing
  validator's reason; `Preview` and `Commit` actions are disabled while
  `invalid.length > 0`.
- **P4-FR-5.** Preview MUST be reversible without a full page reload.
- **P4-FR-6.** Invalid edits MUST never partially apply — either the
  entire draft applies, or none of it does.
- **P4-FR-7.** Commit MUST be allowed to redefine the persisted shape
  if the new schema improves clarity (pre-v1 explicitly permits this).
  Old shapes are dropped via the version-defensive read described in
  the design.

### Data shapes

The contract type (`ConfigDraft`) is defined in the design doc.

```ts
type ValidationFinding = {
  readonly path: ConfigPath;
  readonly code: 'out-of-range' | 'monotonic-violation' | 'unknown-field';
  readonly message: string;
};
```

### Acceptance criteria

- **P4-AC-1.** Given a previewable field is edited, when the user
  clicks "Preview", the live session reflects the new value within ≤ 1
  tick and `useFingerprintRecorder` state is unchanged.
- **P4-AC-2.** Given the user clicks "Revert", the live session
  reflects the committed value within ≤ 1 tick and the draft equals the
  committed config.
- **P4-AC-3.** Given a commit-only field is edited, the "Preview"
  action is disabled and "Commit + Restart" is the only enabled write
  action.
- **P4-AC-4.** Given an invalid edit (e.g., negative decay rate), both
  actions are disabled and the editor shows the failing validator's
  reason inline.
- **P4-AC-5.** Given a successful commit, on next load the persisted
  shape is the new shape; no migration code runs and no error is
  surfaced.

### Out of scope (P4)

- Visual config diffing (only field-level text diff this increment).
- Per-field undo history (only the all-or-nothing revert).
- Sharing draft configs across browsers / users.

### Dependencies on other pillars

- Triggers a fresh fingerprint window on commit (**P3**).
- Tour chapter 4 walks through a Preview + Revert cycle (**P1**).

## P5 — Second scenario

### Outcome

Demonstrate that the agent core is reusable across interaction domains,
not tied to one Tamagotchi-style loop.

### Functional requirements

- **P5-FR-1.** The `Scenario` contract (per design) is implemented and
  registered in `useScenarioCatalog`.
- **P5-FR-2.** The existing nurture-pet loop is refactored into a
  `pet-care` scenario implementing `Scenario` (no behavioral change;
  this is a packaging refactor).
- **P5-FR-3.** A second scenario id `companion-npc` is implemented as
  the **reference second scenario**. Its concept is fixed in this spec
  as a thin reference implementation; the specific needs / skills /
  behavioral signature are revisable during the second-scenario plan
  kickoff (per option **u** locked in brainstorm).
- **P5-FR-4.** A scenario selector UI is rendered in the shell header.
  Selecting a scenario:
  - calls `useScenarioCatalog.setActive(id)`,
  - which navigates to `/play/<id>`,
  - which triggers the cross-store coordination defined in the design
    (session reset + new fingerprint window).
- **P5-FR-5.** Each scenario has its **own** seed/config persistence
  scope; switching scenarios does not leak the other scenario's last
  seed or last config.
- **P5-FR-6.** Both scenarios MUST satisfy the determinism gates: the
  Playwright `scenario-swap.spec.ts` runs the same swap pattern twice
  under the same seeds and asserts identical fingerprint verdicts.

### `companion-npc` reference shape (revisable in plan kickoff)

```ts
const companionNpc: Scenario = {
  id: 'companion-npc' as ScenarioId,
  displayName: 'Companion NPC',
  narrative:
    'A patrolling companion that reacts to broadcast moods from a paired pet ' +
    'and balances its own boredom and curiosity needs against patrol duties.',
  // seedScope, skillBundle, configSchema, initialAgentSpec defined in
  // the pillar plan kickoff once the behavioral signature is locked.
};
```

### Acceptance criteria

- **P5-AC-1.** Given the user is on `/play/pet-care`, when they select
  `companion-npc` from the scenario selector, the URL becomes
  `/play/companion-npc` and the agent restarts under the new scenario.
- **P5-AC-2.** Given the second scenario is active, the trace panel,
  cognition diff panel, fingerprint badge, and JSON editor all render
  correctly against the new scenario's data shapes.
- **P5-AC-3.** Given the user swaps `pet-care ↔ companion-npc` twice,
  each scenario's last-known seed and committed config are preserved
  independently.
- **P5-AC-4.** Given a scenario swap to `<scenarioId>`, within ≤ 1
  tick all of the following agree on the new id: the URL
  (`/play/<scenarioId>`), the persisted `demo.v2.scenario.activeId`
  value, and the shell header's primary heading (which renders the
  scenario's `displayName` and one-line `narrative` from the
  `Scenario` contract). The primary heading carries an ARIA label
  restating the scenario id so the swap is observable to assistive
  tech, not only colour/typography.
- **P5-AC-5.** The Playwright `scenario-swap.spec.ts` passes on every
  CI run.

### Out of scope (P5)

- Multi-agent shared environments (deferred to the Excalibur follow-up
  per planning doc).
- Three or more scenarios.
- Cross-scenario state transfer.

### Dependencies on other pillars

- Provides scenario id to **P3** (fingerprint scope key) and to the
  cognition mode probe used by **P2**.

## Wave-0 — Demo rename preflight

The rename is **not** a pillar; it is the atomic delivery slice that
unblocks the rest of the increment. It rides as its own plan and its
own PR per the planning doc's "atomic delivery slice (no split merge)"
rule.

### Functional requirements

- **R-FR-1.** `examples/nurture-pet/` is renamed to
  `examples/product-demo/` via `git mv` (history preserved).
- **R-FR-2.** Root npm scripts `demo:install`, `demo:dev`, `demo:build`
  shell into the new path.
- **R-FR-3.** A new `npm run e2e` script runs Playwright against the
  renamed workspace (introduced here so all later pillar PRs can
  consume it).
- **R-FR-4.** The GitHub Pages workflow uploads from
  `examples/product-demo/dist`.
- **R-FR-5.** Test fixtures and import paths referencing
  `examples/nurture-pet` are updated.
- **R-FR-6.** `README.md`, `CLAUDE.md`, `PUBLISHING.md`, and any
  `docs/` references to `examples/nurture-pet` are updated in the same
  PR.
- **R-FR-7.** A pre-merge dry-run gate is recorded: build the demo,
  confirm the artifact upload path, confirm the Pages deploy job
  resolves the new folder.
- **R-FR-8.** A post-merge `demo`-branch verification step is recorded:
  the public Pages URL serves the renamed workspace's build.

### Acceptance criteria

- **R-AC-1.** `npm run demo:dev` and `npm run demo:build` both succeed
  against `examples/product-demo` in a clean clone.
- **R-AC-2.** CI Pages workflow publishes from
  `examples/product-demo/dist` with no manual patching.
- **R-AC-3.** No tracked file in the repo references
  `examples/nurture-pet` (verified by a `grep` step in the rename plan).
- **R-AC-4.** `npm run e2e` exits 0 against a placeholder Playwright
  config (the named scripts are added by their owning pillar PRs).

### Out of scope

- Any pillar-specific code (rename PR is renaming + script wiring +
  doc sweep only).

## Cross-cutting non-functional requirements

### Determinism (NFR-D)

- **NFR-D-1.** No use of `Date.now()`, `Math.random()`, `setTimeout`,
  `setInterval`, or `requestAnimationFrame` inside
  `examples/product-demo/src/demo-domain/` or
  `examples/product-demo/src/stores/domain/`. ESLint enforces this in
  the rename PR.
- **NFR-D-2.** Any RNG flowing into a domain store originates from the
  active session's `SeededRng`; view stores do not own RNG.
- **NFR-D-3.** Time advancement in tests uses `ManualClock`; no
  `vi.useFakeTimers` shortcuts in domain-store tests.

### Performance (NFR-P)

- **NFR-P-1.** Trace panel + diff panel + fingerprint badge update only
  on `AGENT_TICKED`; no per-frame polling.
- **NFR-P-2.** Metric ring buffers in **P2** are bounded by
  `windowTicks`; the buffer's memory footprint is constant under steady
  state.
- **NFR-P-3.** A 10-minute soak in either scenario produces no visible
  UI slowdown and no listener leaks (verified via DevTools heap snapshot
  parity at start vs end of soak).

### Accessibility (NFR-A)

- **NFR-A-1.** All tour highlights are keyboard-focusable; the tour can
  be completed without a mouse.
- **NFR-A-2.** The fingerprint badge has an ARIA label restating the
  verdict (color is not the only indicator).
- **NFR-A-3.** Route changes restore focus to the new view's primary
  heading.

### i18n (NFR-I)

- **NFR-I-1.** All user-visible copy lives under
  `examples/product-demo/src/copy/`; English-only this increment;
  copy is not extracted via a runtime i18n library yet, but is grouped
  to make extraction trivial later.

## Storage contract

The full storage key inventory is defined in the design doc; this spec
restates the **invariants**:

- **STO-1.** Every persisted value is wrapped `{ v: 1, data: ... }`.
  A version mismatch on read discards the value and re-initializes (no
  migrators).
- **STO-2.** No `nurture-pet.*` or `demo.*` (un-prefixed) keys are
  written by any pillar.
- **STO-3.** The rename preflight slice deletes any pre-existing
  `nurture-pet.*` and un-prefixed `demo.*` keys on first load (dev mode
  only emits a one-line console notice).

## Open questions log (deferred to pillar plans)

- **OQ-P1.** Tour copy tone — set in pillar 1 plan kickoff.
- **OQ-P2.** Initial confidence-label thresholds — pillar 2 plan tunes
  after the first soak run.
- **OQ-P3.** `minSampleFraction` for the fingerprint "insufficient"
  verdict — pillar 3 plan tunes after the first soak run; design's
  starting value is `0.95`.
- **OQ-P4.** Whether the JSON editor's diff summary should ship with
  field-level color cues this increment or in a polish PR — pillar 4
  plan decides.
- **OQ-P5.** `companion-npc` final behavioral signature — pillar 5
  plan kickoff.
