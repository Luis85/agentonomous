# agentonomous — v1 Plan (tightened)

> Cross-references: `docs/specs/vision.md`, `docs/specs/mvp-demo.md`,
> [[mvp-demo-roadmap]] (superseded), [[pre-v1-next-session]] (superseded).
>
> Revised 2026-04-19 after the brainstorm that split release trains and
> deferred kernel modularization to post-v1, and again after incorporating
> the post-P4 implementation review (AgentTicked, Reasoner.reset
> harmonization, `_internalPublish`/`_internalDie` rename).

## Shape of the release

Two independent release trains, run **sequentially**:

- **0.9.0 → `demo` branch.** The shareable artifact. Closes the MVP demo
  spec (chapters A–E) and ships the public demo URL.
- **1.0.0 → npm publish.** Library release. Minimal polish + LLM-port
  prep + breaking renames + narrowed public surface. Ships after 0.9.0
  is promoted.

The `demo` branch tracks the latest shippable version — when 1.0.0
cuts, `demo` follows.

Kernel modularization, `AgentBuilder`, factory presets, three-agent
showcase, and concrete LLM providers are **post-v1** (1.1+ / Phase B).

## Where we are

Status against the MVP demo spec:

| Chapter              | Spec requirement                                    | Actual state                                                                                                                                   | Remaining                                     |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| A — Living agent     | Needs decay, HUD, autonomy observable               | ✅ Done. Decay calibrated (`BASE_TIME_SCALE = 10`). HUD renders needs + modifiers + interactions.                                              | —                                             |
| B — Decision Trace   | Trace panel with needs, candidates, selected action | ✅ Done. `traceView.ts` with progressive disclosure.                                                                                           | Polish only                                   |
| C — Cognition switch | Dropdown for heuristic / BT / BDI / learning        | ⚠️ Adapters built (`MistreevousReasoner`, `JsSonReasoner`, `BrainJsReasoner`). **`Agent.setReasoner()` not yet shipped. UI dropdown missing.** | Library PR (setReasoner) + demo PR (dropdown) |
| D — JSON config      | Read/edit/apply species JSON                        | ✅ Done. `speciesConfig.ts` with `applyOverride()`.                                                                                            | Polish only                                   |
| E — Determinism      | Seed display, replay, new-seed                      | ✅ Done. `seed.ts` panel mounted.                                                                                                              | D2 integration test                           |

Carried forward from the post-P4 implementation review:

- **`AgentTicked` bus event** — would let `bindAgentToStore` drive the
  HUD directly and retire the rAF companion workaround the last polish
  PR introduced.
- **`Reasoner.reset()` harmonization** — the three cognition adapters
  each implement reset-like behavior inconsistently; lift it to the
  port contract.
- **`_internalPublish` / `_internalDie` rename** — breaking surface
  change on `Agent`; must land before v1.0.0.

---

## 0.9.0 — Demo release

**Goal:** All five spec chapters (A–E) pass end-to-end. Demo is
deployable to GitHub Pages on the `demo` branch. All "still-outstanding"
items from the post-P4 review closed (except the breaking rename, which
lives in 1.0).

### 0.9.1 — `AgentTicked` bus event

**What:** Emit a new `AgentTicked` domain event at the end of every
tick. Lets `bindAgentToStore` drive the HUD directly, retiring the rAF
companion workaround.

**Two PRs:**

1. **Library PR** (minor bump):
   - New event type string on the standard bus (e.g., `'agent.ticked'`).
   - Payload: tick number, virtual time elapsed (seconds), wall time
     (ms), selected action summary (or `null`).
   - Emitted at the end of the tick pipeline, after trace is produced.
   - Non-breaking addition. No existing event changes.
   - Replay-equivalence test: identical seed → identical `AgentTicked`
     sequence (ordering, payloads).

2. **Demo PR** (wires the new event into the nurture-pet demo):
   - Keep `requestAnimationFrame` at `examples/nurture-pet/src/main.ts:185,189`
     as the tick driver.
   - Replace the in-rAF HUD/trace refresh with an `agent.subscribe`
     listener for `AgentTicked` that calls `hud.update(state)` and
     `traceView.render(trace, state)`.
   - Net effect: rAF drives ticks; the event drives UI. No more
     coupled refresh pattern.

**Why first:** Cleanest follow-up to the polish PR that just merged,
removes a workaround, and unblocks a nicer demo-wiring shape for
everything downstream. Also forces us to think about tick-event
determinism before more reasoners pile on.

### 0.9.2 — `Agent.setReasoner()` (library) + cognition switcher UI (demo)

**What:** Close P4. Two PRs:

1. **Library:** `Agent.setReasoner(reasoner)` — live-swap the reasoner
   on a running agent. Tests cover swap mid-tick, determinism under
   swap, and trace continuity. Minor bump.
2. **Demo:** Dropdown in `examples/nurture-pet` listing four cognition
   modes (heuristic / BT / BDI / learning). Each option has a
   capability state (available vs "install X to enable"). Selecting a
   mode calls `agent.setReasoner(newReasoner)`. Capability-state
   tooltips explain missing peers.

**Where:** `src/agent/Agent.ts` + `src/agent/AgentFacade.ts` for the
library, `examples/nurture-pet/src/cognitionSwitcher.ts` (new) +
`main.ts` wire for the demo.

**This declares MVP-demo-complete** (Chapter C closes).

### 0.9.3 — brain.js training persistence flow (Chapter E)

**What:** Extend persistence UI with a "Train" button that runs a short
brain.js training batch, serializes the network via `.toJSON()`, stores
it alongside the agent snapshot, rehydrates on reload.

**Library changes:** Likely none — `BrainJsReasoner` already accepts
pre-trained network weights.

**Scope:** Demo PR.

### 0.9.4 — `Reasoner.reset()` harmonization

**What:** Lift `reset()` to the `Reasoner` port contract as an
**optional** method (implementors opt in; bump to required happens
with kernel modularization in 1.1 if warranted).

**Contract — when the kernel calls `reset()`:**

1. Immediately after `Agent.setReasoner(next)` on the _incoming_
   reasoner — so its internal state starts clean on the next tick.
   The _outgoing_ reasoner is discarded without a reset call.
2. Immediately after snapshot restore, on the live reasoner — so any
   stateful internals (plans-in-progress, learning traces, BT ticks)
   don't carry stale continuity across restore.
3. Never called mid-tick. Always between ticks.

Adapters (`mistreevous`, `js-son`, `brainjs`) converge on these two
call sites with semantically-equivalent behavior (clear plan state,
zero per-tick accumulators; preserve trained network weights).

**Scope:** Port PR + three adapter PRs (or one bundled PR since
they're all in-repo). Patch or minor bump depending on whether a
no-op default implementation is added to the port itself.

### 0.9.5 — Excalibur subpath rename

**What:** Move `src/integrations/excalibur/` →
`src/rendering/adapters/excalibur/`. Brings Excalibur into the same
`<category>/adapters/<lib>/` pattern the cognition adapters already use,
and sets up future Pixi / three.js / Phaser adapters to land cleanly
without another rename.

**Demo impact:** None in source — verified that
`examples/nurture-pet/src/**` does not import the Excalibur adapter.
The only reference is in `examples/nurture-pet/package-lock.json`,
refreshed on `npm install`.

**Scope (exact file touches):**

- Move `src/integrations/excalibur/` → `src/rendering/adapters/excalibur/`.
- `package.json#exports`: remove `./integrations/excalibur`, add
  `./rendering/adapters/excalibur`.
- `typedoc.json`: update entryPoint / entryPointStrategy references.
- `README.md`: update any import examples.
- `CLAUDE.md`: update the architecture-map line that references
  `src/integrations/excalibur/`.
- `docs/specs/vision.md`: update integration-pattern reference.
- `.changeset/`: new entry — "breaking: rename `/integrations/excalibur`
  subpath to `/rendering/adapters/excalibur`."
- New test: `tests/unit/exports.test.ts` (or similar) asserts
  `agentonomous/rendering/adapters/excalibur` resolves.

**Why in 0.9:** 0.9 is the shareable artifact — its import paths need
to match 1.0's.

### 0.9.6 — D-item cleanup

| ID  | Description                                 | Scope             |
| --- | ------------------------------------------- | ----------------- |
| D1  | Expose `getTimeScale()` on `AgentFacade`    | Library PR        |
| D2  | Parallel-agent determinism integration test | Separate small PR |
| D3  | `Modifier.visual.label?` field              | Demo bundle       |
| D5  | Speed-picker visual weight (CSS)            | Demo bundle       |
| D6  | Delete dead `#pet-age` div                  | Demo bundle       |
| D7  | `formatRemaining` / `formatAge` spacing     | Demo bundle       |

D1 stands alone (library). D2 stands alone (integration test). D3 /
D5 / D6 / D7 ride together as a single demo cleanup PR — all trivial.

### 0.9.7 — Soak + DoD verification

Run the demo for 10 minutes at each speed setting. Walk through
chapters A–E. Fix any runtime errors or UX issues found. PR
description includes the DoD checklist.

### Promote + tag

Follow the demo-deployment runbook in
[`PUBLISHING.md#demo-deployment`](../../PUBLISHING.md#demo-deployment):
fast-forward `demo` from `develop`, push, wait for the Pages workflow
to go green, tag `0.9.0-demo` on the promotion commit.

---

## 1.0.0 — npm publish

**Goal:** Library release. Breaking renames + LLM-port prep + narrowed
public surface + audit. Sequential after 0.9.0 ships. `createAgent`
stays the single ingress — no factory presets, no builder, no kernel
extraction.

### 1.0.1 — `_internalPublish` / `_internalDie` rename

**What:** Rename the two `_internal`-prefixed verbs on `Agent` (see
`src/agent/Agent.ts:281` and `:286`) to their post-v1 shape. Pure
rename + call-site sweep + test rename; no behavior change.

**Current:**

- `Agent._internalPublish(event: DomainEvent): void` — delegates to
  private `publish(event)`. Called from 11 sites under
  `src/agent/internal/`.
- `Agent._internalDie(cause, reason, at): void` — delegates to
  private `die(...)`. Called once from `NeedsTicker` on health
  depletion.

**Target names (pick during the PR):**

- Option A — drop the underscore and prefix: `publishEvent` /
  `routeDeath`. Honest about what they do; no leading punctuation.
- Option B — use a `kernel` namespace object: `agent.kernel.publish` /
  `agent.kernel.die`. Signals "internal contract" without `_`.
- Option C — migrate callers to an `AgentInternals` interface (helper
  classes take it as a constructor dep) and drop the methods from
  `Agent` entirely. Cleanest but touches 11 call sites' constructors.

Default choice if no preference: **Option A**. Simplest diff, lowest
risk, matches the "hide Agent class" direction in 1.0.3.

**Why first in 1.0:** Breaking surface change. Must land before the
API freeze. Separated from "narrow the surface" because it's a
directed rename with its own tests — doesn't touch module / hook
infrastructure.

**Scope:** One library PR. Major-bump changeset.

### 1.0.2 — `LlmProviderPort` (minimum set)

**What:** Define the provider port so Phase B can slot concrete
adapters in without a breaking change.

**Surface:**

- `LlmProviderPort.complete(messages, options) → Promise<Completion>`.
  Completion only — no streaming.
- Budget / cost types (token caps, cost ceiling).
- Prompt-caching hint shape (request-side hint that a cache breakpoint
  can go here; provider decides).
- `MockLlmProvider` for tests (scripted responses, deterministic).

**Out of scope for 1.0:** Streaming, tool-use, concrete providers
(Anthropic / OpenAI adapters). All land in Phase B.

**Where:** `src/ports/LlmProviderPort.ts`, `src/ports/MockLlmProvider.ts`.

### 1.0.3 — Narrow the public surface

**What:** Move rewrite-prone types behind the barrel so 1.1's kernel
modularization doesn't force a 2.0.

**Hide (move to `internal/`, not re-exported):**

- `AgentModule` interface (gets reshaped in 1.1).
- `ReactiveHandler`.
- `Agent` class direct constructor + `AgentDeps`. Force consumers
  through `createAgent`.
- Tick-pipeline helpers (already under `internal/`; just don't barrel).

**Mark `@experimental` (public, but JSDoc flags reshape risk):**

- `Needs`, `Modifiers`, `AgeModel` direct constructors. Used by tests
  and power users; wrapped by modules in 1.1.

**`@experimental` convention for this library:**

- TSDoc `@experimental` tag in the JSDoc block, _plus_ a one-line
  body note: `@experimental — shape may change in 1.1; prefer
config-based input via createAgent where possible.`
- No tooling-level enforcement in 1.0 (tsc has no built-in awareness;
  typedoc renders the tag as a callout, which is enough for now).
- Semver contract: reshaping an `@experimental` symbol is a **minor**
  bump, not major. Consumers are on notice via the tag.
- Adding `@experimental` to an existing symbol is itself a minor
  bump, not major, since it doesn't change runtime behavior.

**Keep public (1.x stable contract):**

- `createAgent`, `CreateAgentConfig`, `defineSpecies`, `SpeciesRegistry`,
  `SpeciesDescriptor`.
- `AgentFacade`, `getState()` shape, `DecisionTrace` shape.
- `subscribe`, `DomainEvent` base, event type strings (incl. new
  `AgentTicked`).
- All ports: `WallClock` / `SystemClock` / `ManualClock`, `Rng` /
  `SeededRng`, `Logger`, `EventBusPort`, `SnapshotStorePort`,
  `LlmProviderPort` (new), `Reasoner` (incl. `reset()`),
  `BehaviorRunner`, `Learner`, `NeedsPolicy`, `MemoryRepository`,
  `MoodModel`.
- `Skill` + `SkillRegistry` + `ok` / `err`.
- Persistence adapters (`LocalStorage` / `Fs` / `InMemory`).
- `defineLifecycle`, life-stage types.
- `defineRandomEvent`.
- `Embodiment` shape (forced — consumed by Excalibur adapter).

**Subpath export freeze** (add a resolution test so renames break CI):

- `agentonomous`
- `agentonomous/rendering/adapters/excalibur`
- `agentonomous/cognition/adapters/mistreevous`
- `agentonomous/cognition/adapters/js-son`
- `agentonomous/cognition/adapters/brainjs`

### 1.0.4 — API / JSDoc audit

Walk every public export. Check:

- Name is clear and general-purpose (no pet-specific names leaked into
  core).
- JSDoc has a one-sentence concept + non-obvious invariants. No
  redundant `@param` / `@returns` when types self-document.
- Subpath exports all resolve (test added in 1.0.3).

### 1.0.5 — Changeset + publish

- Major-bump changeset (0.9 → 1.0).
- `PUBLISHING.md` checklist complete.
- `npm run verify` green.
- Bundle-size budget (35 kB core) respected.
- Publish to npm.
- Promote `develop` → `demo`. Tag `1.0.0`.

---

## Post-v1 (1.1+, Phase B)

Captured so nothing gets lost. Not on the critical path.

### 1.1 — Composable kernel

- Enhanced `AgentModule` interface (`requires` / `provides` / `hooks`
  with relative ordering / `serialize` / `restore` / `dispose`).
- `AgentBuilder` with topological hook sort + cycle detection.
- Nine module extractions (memory → random-events → modifiers → needs
  → lifecycle → persistence → mood → animation → cognition), one PR
  each, in dependency order.
- Snapshot schema v2 → v3 migration (monolithic → keyed-by-module
  slices).
- Factory presets: `createPetAgent`, `createNPCAgent`,
  `createMinimalAgent`.
- Three-agent showcase in the demo (pet / NPC / bot tabs).
- Decide whether `Reasoner.reset()` becomes required on the port.

### Phase B (parallel to 1.1, separate track)

- Streaming support on `LlmProviderPort`.
- Tool-use shape.
- Concrete provider adapters: `AnthropicLlmProvider`,
  `OpenAiLlmProvider`.
- Markdown memory, jobs, social subsystems.

---

## Sequencing at a glance

| Phase | Step                                           | Depends on    | PR scope                            |
| ----- | ---------------------------------------------- | ------------- | ----------------------------------- |
| 0.9.0 | 0.9.1 `AgentTicked` event                      | —             | 1 PR (minor bump)                   |
| 0.9.0 | 0.9.2 `setReasoner` + dropdown                 | 0.9.1         | 2 PRs (library + demo)              |
| 0.9.0 | 0.9.3 brain.js persistence                     | 0.9.2         | 1 demo PR                           |
| 0.9.0 | 0.9.4 `Reasoner.reset()` harmonization         | 0.9.2         | 1 bundled PR or 4 small             |
| 0.9.0 | 0.9.5 Excalibur subpath rename                 | —             | 1 PR (breaking)                     |
| 0.9.0 | 0.9.6 D-items                                  | —             | D1 solo + D2 solo + D3/5/6/7 bundle |
| 0.9.0 | 0.9.7 Soak + DoD                               | all above     | 1 PR                                |
| 0.9.0 | Promote + tag                                  | all above     | —                                   |
| 1.0.0 | 1.0.1 `_internalPublish`/`_internalDie` rename | 0.9.0 shipped | 1 PR (major)                        |
| 1.0.0 | 1.0.2 `LlmProviderPort`                        | 1.0.1         | 1 PR                                |
| 1.0.0 | 1.0.3 Narrow surface                           | 1.0.2         | 1 PR                                |
| 1.0.0 | 1.0.4 API/JSDoc audit                          | 1.0.3         | 1 PR                                |
| 1.0.0 | 1.0.5 Changeset + publish                      | 1.0.4         | 1 PR                                |

**Estimated sessions:** 0.9.0 in **~3 sessions** (9–11 PRs, with
bundling options noted below). 1.0.0 in **~2 sessions** (5 PRs) after.

**PR-bundling guidance (which can combine without muddying review):**

- 0.9.1 library + 0.9.1 demo → bundle is OK if both are small and
  the test coverage stays clean; otherwise keep separate.
- 0.9.2 library (`setReasoner`) + 0.9.2 demo (dropdown) → keep
  **separate**. Library needs its own test sweep; demo can't land
  until library is on `develop`.
- 0.9.4 port update + three adapter updates → bundle into **one PR**
  since all four files are in-repo and the behavior is tightly
  coupled.
- 0.9.6 D-items → D1 standalone (library surface change), D2
  standalone (new integration test file), D3 + D5 + D6 + D7 → one
  demo cleanup PR.
- 0.9.5 Excalibur rename → standalone. Breaking change deserves its
  own review.
- 0.9.7 soak + DoD → one PR with DoD checklist in the description, no
  separate sub-PRs.

---

## Risks

| Risk                                                                                         | Impact       | Mitigation                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentTicked` breaks determinism under snapshot replay                                       | Medium       | Emit it at a fixed tick stage (end of pipeline). Add a replay-equivalence test in the same PR.                                                                                                                                                                                                                |
| `setReasoner` mid-tick produces a partial trace                                              | Medium       | Swap takes effect at the next tick boundary; document this invariant in JSDoc + test it.                                                                                                                                                                                                                      |
| `Reasoner.reset()` as a required method breaks external implementations                      | Low (pre-v1) | Ship as optional in 0.9.4. Decide required-vs-optional during 1.1 kernel modularization.                                                                                                                                                                                                                      |
| Narrowing the surface breaks the demo import graph                                           | Medium       | Move one cluster at a time; `npm run verify` between each. Demo is in the same repo — compile errors surface immediately.                                                                                                                                                                                     |
| `LlmProviderPort` shape doesn't survive Phase B streaming / tool-use                         | Medium       | Additions-only discipline in Phase B. Start with completion-only so the minimal surface has the best chance of being stable.                                                                                                                                                                                  |
| Excalibur subpath rename breaks external consumers                                           | Low          | Pre-v1.0, no public consumers. Changeset flags it as breaking.                                                                                                                                                                                                                                                |
| `_internalPublish` / `_internalDie` rename gets forgotten under 1.0 pressure                 | Low          | Slotted as the first 1.0 PR; can't be skipped because the changeset locks the rename into the major bump.                                                                                                                                                                                                     |
| 35 kB bundle budget exceeded once `AgentTicked` + `LlmProviderPort` + `MockLlmProvider` land | Medium       | Re-measure via `npm run analyze` after 0.9.1 and again after 1.0.2. If within 10% of budget, audit imports for tree-shake hazards (re-exports, default instances, side-effect imports). If the budget is blown, raise the ceiling with a deliberate decision + changelog entry rather than gaming the number. |

## Definition of done

### 0.9.0

1. MVP demo chapters A–E pass end-to-end in one session.
2. Same-seed replay yields identical `DecisionTrace` output (D2 test).
3. At least two cognition modes show visibly different behavior via
   the switcher.
4. At least one JSON parameter causes a visible behavior change.
5. 10-minute soak with no runtime errors at each speed setting.
6. `AgentTicked` fires exactly once per tick; demo HUD + trace panel
   refresh via event subscription, not in-rAF polling. Replay with the
   same seed produces an identical `AgentTicked` sequence.
7. `Reasoner.reset()` behavior is consistent across all three adapters.
8. Excalibur imports via the new subpath only; no references to the
   old path anywhere.
9. `npm run verify` green.
10. `npm run analyze` shows core bundle within the 35 kB budget (or a
    deliberate budget raise with a changelog entry).
11. `demo` branch updated per
    [`PUBLISHING.md#demo-deployment`](../../PUBLISHING.md#demo-deployment);
    GitHub Pages deploys; tag `0.9.0-demo`.

### 1.0.0

1. 0.9.0 DoD still holds.
2. `_internalPublish` / `_internalDie` renamed; no old names reachable
   anywhere in `src/` or `tests/`.
3. `LlmProviderPort` + `MockLlmProvider` shipped with JSDoc + tests.
   At least one test exercises the mock end-to-end via a `Reasoner`
   wrapper to prove the port shape is usable.
4. Public surface audit complete. All internals hidden or
   `@experimental`-tagged per plan; `@experimental` convention
   documented in `CONTRIBUTING.md` or `STYLE_GUIDE.md`.
5. All five subpath exports resolve (`tests/unit/exports.test.ts`
   enforces).
6. `npm run verify` green.
7. `npm run analyze` shows core bundle within the 35 kB budget (or a
   deliberate budget raise with changelog entry).
8. Changeset committed (major bump).
9. `PUBLISHING.md` v1.0.0 checklist complete.
10. Published to npm. `demo` branch follows per
    [`PUBLISHING.md#demo-deployment`](../../PUBLISHING.md#demo-deployment).

## Plan chunking

This roadmap is a **superplan**. Each numbered step below gets its own
self-contained implementation plan under `.claude/plans/`, drafted and
executed one at a time. Plans are written with the
`superpowers:writing-plans` skill and executed with
`superpowers:subagent-driven-development` (or
`superpowers:executing-plans` when subagents aren't available).

Plan-document edits may be committed directly to `develop` (see
memory: `feedback_plan_crafting_on_develop`). Implementation PRs still
follow the standard topic-branch flow defined in `CLAUDE.md`.

| #   | Step  | Plan file                               | PRs inside                | Status      |
| --- | ----- | --------------------------------------- | ------------------------- | ----------- |
| 1   | 0.9.1 | `0.9.1-agent-ticked-event.md`           | library + demo            | Not drafted |
| 2   | 0.9.2 | `0.9.2-set-reasoner-and-switcher.md`    | library + demo            | Not drafted |
| 3   | 0.9.3 | `0.9.3-brainjs-persistence.md`          | demo                      | Not drafted |
| 4   | 0.9.4 | `0.9.4-reasoner-reset-harmonization.md` | 1 bundled                 | Not drafted |
| 5   | 0.9.5 | `0.9.5-excalibur-subpath-rename.md`     | 1 breaking                | Not drafted |
| 6   | 0.9.6 | `0.9.6-d-items-cleanup.md`              | D1 + D2 + D3/5/6/7 bundle | Not drafted |
| 7   | 0.9.7 | `0.9.7-soak-and-promote.md`             | 1 + release               | Not drafted |
| 8   | 1.0.1 | `1.0.1-internal-rename.md`              | 1 major                   | Not drafted |
| 9   | 1.0.2 | `1.0.2-llm-provider-port.md`            | 1                         | Not drafted |
| 10  | 1.0.3 | `1.0.3-narrow-public-surface.md`        | 1                         | Not drafted |
| 11  | 1.0.4 | `1.0.4-api-jsdoc-audit.md`              | 1                         | Not drafted |
| 12  | 1.0.5 | `1.0.5-changeset-and-publish.md`        | 1 + release               | Not drafted |

**Update this table** as plans are drafted (`Drafted`), enter execution
(`In progress`), or ship (`Shipped — <PR link or tag>`). The table is
the single source of truth for roadmap progress; individual plan files
are the source of truth for the work inside each chunk.

## Open questions

1. **Which scenario best contrasts BT vs BDI in the cognition switcher?**
   Decide during 0.9.2 by experimenting once the UI is wired.
2. **Smallest brain.js training dataset for a visible effect?** Test
   during 0.9.3. Start with 20–50 samples mapping need states to
   actions.
3. **Is the `Embodiment` shape final?** It's public (forced by the
   Excalibur adapter). Phase B or a new render adapter may surface
   needed fields. Flag for review when the second render adapter
   lands.
4. **Should `Reasoner.reset()` be required on the port in 1.1?** Decide
   during kernel modularization once the migration path for custom
   reasoners is understood.
