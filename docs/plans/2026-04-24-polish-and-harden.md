# Polish + harden — pre-1.0 increments

> Cross-references: `docs/specs/vision.md`, `docs/specs/mvp-demo.md`,
> `docs/specs/2026-04-24-post-tfjs-improvements.md`,
> `docs/plans/2026-04-19-v1-comprehensive-plan.md`.
>
> Written 2026-04-24 after PRs #63–#70 merged (rename + LLM port +
> narrowed surface + JSDoc audit + demo loss-toast + Untrain +
> TfjsLearner). The 1.0.0 npm publish is **held** by owner decision —
> see `MEMORY.md → project_v1_release_hold.md`. This roadmap is the
> "polish + harden" track that runs before that publish; major-bump
> changesets continue accumulating on `develop`.
>
> Each increment lives in its own topic branch from `develop`, opens
> one PR, gets Codex-reviewed, and merges independently. No stacking.

## Goals

1. **Polish the demo** so a visitor sees the value (cognition is real,
   training is observable, decisions are explainable) within 30 seconds.
2. **Harden CI** so regressions surface earlier — bundle-size deltas,
   npm-audit gating, OS / backend matrix.
3. **Prep for LLM provider integration** without shipping a concrete
   adapter. The `LlmProviderPort` + `MockLlmProvider` (PR #66) are the
   1.0 contract; this roadmap lands documentation + an example wiring
   so the surface is exercised before Phase B's `AnthropicLlmProvider`
   / `OpenAiLlmProvider` work.
4. **Close the reinforcement loop** by wiring `TfjsLearner` (PR #70)
   into the demo's Learning mode so training emerges from observed
   skill outcomes instead of only from the Train button.

## Out of scope (deferred — do not pull in)

- **1.0.0 npm publish.** Hold per
  `MEMORY.md → project_v1_release_hold.md`. Keep accumulating
  changesets; the publish PR runs separately when owner signals go.
- **Concrete LLM provider adapters** (`AnthropicLlmProvider`,
  `OpenAiLlmProvider`). Phase B. This roadmap only adds docs + a
  `MockLlmProvider` example.
- **Streaming + tool-use on `LlmProviderPort`.** Phase B; additive
  in 1.x per the port's JSDoc contract.
- **R-08 per-subsystem snapshot versioning.** Still gated (touches
  the schema). Required before §1.5 (deterministic training-trajectory
  snapshots from the post-tfjs spec).
- **Kernel modularization (1.1).** Composable `AgentModule`, factory
  presets, three-agent showcase — all post-1.0.
- **sim-ecs / three.js / Pixi integrations.** Phase B.

---

## Sequencing at a glance

Two independent tracks. Pick the one that matches your appetite for the
session — or interleave.

| #   | Track  | Branch                                        | Scope                                                                       | Cost | Bump  | Spec ref                                       |
| --- | ------ | --------------------------------------------- | --------------------------------------------------------------------------- | ---- | ----- | ---------------------------------------------- |
| 1   | CI     | `chore/ci-dry-release-and-size-comment`       | DRY release.yml + size-limit-action PR comment                              | XS   | —     | post-tfjs §3.2 + §3.3                          |
| 2   | CI     | `chore/ci-npm-audit-gate`                     | `npm audit --audit-level=high` blocking step                                | XS   | —     | post-tfjs §3.4                                 |
| 3   | demo   | `feat/demo-loss-curve`                        | SVG sparkline of `history.loss` under the Train button                      | S    | —     | post-tfjs §2.1                                 |
| 4   | demo   | `feat/demo-train-epoch-progress`              | `TfjsReasoner.train` exposes `onEpochEnd`; demo renders `Training… 42/100`  | XS+XS| minor | post-tfjs §2.2                                 |
| 5   | lib    | `feat/llm-port-example-and-readme`            | README LLM section + `examples/llm-mock/` minimal MockLlmProvider playback  | S    | —     | this roadmap (LLM-prep)                        |
| 6   | demo+lib | `feat/tfjs-learner-in-demo`                 | Wire `TfjsLearner` to demo's Learning mode; observed skills feed training   | M    | —     | post-tfjs §1.1 follow-up                       |
| 7   | lib    | `feat/tfjs-multi-output-softmax`              | N-way softmax over skills; `interpret` picks `argmax`; demo retrains        | S+M  | minor | post-tfjs §1.2                                 |
| 8   | demo   | `feat/demo-richer-feature-vector`             | Add mood + modifier-count + recent-events to the feature vector             | S    | —     | post-tfjs §2.4                                 |
| 9   | demo   | `feat/demo-prediction-strip`                  | HUD strip showing last scalar output + URGENCY_THRESHOLD line               | S    | —     | post-tfjs §2.6                                 |
| 10  | lib    | `feat/tfjs-detect-backend-and-picker`         | `TfjsReasoner.detectBestBackend()` + demo backend dropdown                  | S+S  | minor | post-tfjs §1.6 + §2.7                          |
| 11  | CI     | `chore/ci-actions-sha-pinning`                | SHA-pin `actions/checkout` etc.                                             | S    | —     | post-tfjs §3.5                                 |
| 12  | CI     | `chore/ci-backend-and-os-matrix`              | tfjs CPU + WASM job; macos-latest + windows-latest checks                   | M    | —     | post-tfjs §3.6 + §3.7                          |

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12.
CI hygiene first (cheap; tightens the loop). Demo wins next (visible
value, drives the Learning-mode story). Lib seams in the middle. Backend
+ OS matrix last (depends on §10's backend picker landing first).

---

## Track A — CI hygiene (PRs 1, 2, 11, 12)

### 1 — DRY release.yml + size-limit PR comment

**Branch:** `chore/ci-dry-release-and-size-comment`

**What:**

- Replace inlined format / lint / typecheck / test / build steps in
  `.github/workflows/release.yml` with a single `npm run verify` call
  (matches `CLAUDE.md` pre-PR gate). One-line fix; future verify
  changes auto-propagate.
- Add `andresz1/size-limit-action` step to the existing PR-CI workflow.
  Posts a before/after gzip delta as a sticky PR comment for each of
  the 5 size-budgeted bundles in `package.json#size-limit`.

**Files:**

- `.github/workflows/release.yml` (modify; collapse inlined steps).
- `.github/workflows/ci.yml` or equivalent (modify; add size-limit job).

**No changeset** — CI-only.

**DoD:** A subsequent PR posts the size-comment. Release workflow run
is green on a `0.0.0`-styled tag dry-run.

### 2 — `npm audit` gate

**Branch:** `chore/ci-npm-audit-gate`

**What:** Add `npm audit --omit=dev --audit-level=high` step to the PR
CI. Blocking. Closes the brain.js-style supply-chain hole that slipped
in last time.

**Files:**

- `.github/workflows/ci.yml`.

**DoD:** A test PR that adds a known-vulnerable dep fails the gate.
Current `develop` (post-tfjs swap) passes.

### 11 — Actions SHA pinning

**Branch:** `chore/ci-actions-sha-pinning`

**What:** Replace mutable tags (`actions/checkout@v6`, etc.) with full
40-char commit SHAs. Add a one-line bumper script under `scripts/` so
future updates don't bit-rot.

**When:** Low priority until 1.0 is on the horizon — this is supply-
chain rigor for a published library, not a development necessity.

### 12 — Backend + OS matrix

**Branch:** `chore/ci-backend-and-os-matrix`

**Depends on:** PR #10 (backend picker) so the matrix has a real
consumer to defend.

**What:**

- tfjs job runs under `cpu` AND `wasm` backends (drop `webgl` — needs
  significant headless-runner work).
- Test matrix expands to `macos-latest` + `windows-latest` (was
  Linux-only because brain.js's `gl` chain needed native headers; tfjs
  is pure-JS so the matrix is now cheap).

**Cost:** ~1 extra runner-minute per push. Catches platform surprises
early.

---

## Track B — Demo polish (PRs 3, 4, 6, 8, 9)

### 3 — Loss curve sparkline

**Branch:** `feat/demo-loss-curve`

**What:** Render the `TfjsReasoner.train()` `history.loss` as an SVG
sparkline directly under the Train button. Player sees the number drop
— learning becomes visible evidence, not mystery. Pairs with the
"Trained ✓ — loss X → Y" toast already shipped in PR #69.

**Files:**

- `examples/nurture-pet/src/cognitionSwitcher.ts` — pass `history.loss`
  to a new helper.
- `examples/nurture-pet/src/lossSparkline.ts` (new) — pure-DOM SVG
  renderer. No charting lib (keeps demo bundle small).
- `examples/nurture-pet/index.html` — anchor `<svg id="loss-sparkline">`.
- `tests/examples/lossSparkline.test.ts` (new, jsdom).

**No library change. No changeset.**

**Sequencing:** Do before #4 — #4 builds the live progress on the same
plumbing.

### 4 — Per-epoch progress callback

**Branch:** `feat/demo-train-epoch-progress`

**Library scope:**

- Add `onEpochEnd?: (epoch: number, loss: number) => void` to
  `TrainOptions` in `src/cognition/adapters/tfjs/TfjsReasoner.ts`.
- Inside `train()`, pass it through to `model.fit({ callbacks:
  { onEpochEnd: ... } })`. tfjs already accepts the shape.
- Determinism note in JSDoc: callback is invoked synchronously per
  epoch on the same backend as the rest of inference; no scheduling
  added.

**Demo scope:**

- `cognitionSwitcher.ts` consumes the callback to update the train
  button text (`Training… 42/100`) and (if PR #3 landed) push points
  into the sparkline mid-fit.

**Cost:** XS adapter, XS demo. Two PRs OR one bundled (callback is
small). Recommend bundled — same ceremony, less switching overhead.

**Bump:** minor (additive `TrainOptions` field).

### 6 — `TfjsLearner` wired into demo Learning mode

**Branch:** `feat/tfjs-learner-in-demo`

**What:** Stage 8 (score) of the tick pipeline is currently a no-op in
the demo (`NoopLearner`). Wire a `TfjsLearner` instance to the
Learning-mode reasoner so observed `SkillCompleted` /
`SkillFailed` outcomes accumulate in a buffer, batch-train every 50
outcomes, and the model drifts from the bundled baseline as the user
plays. Closes the post-tfjs §1.1 follow-up arc end-to-end.

**Steps:**

1. In `examples/nurture-pet/src/cognition/learning.ts`, after
   `TfjsReasoner.fromJSON(...)`, build a sibling `TfjsLearner` with
   the same reasoner reference.
2. Define `toTrainingPair(outcome)` projection — a `SkillCompleted`
   becomes a positive-reward pair (features = current need levels at
   tick, label = `[1]`); `SkillFailed` becomes negative (`[0]`).
3. Pass the learner to `createAgent({ learner })`.
4. Add a HUD readout: `Buffered: 12 / 50 — training…` so the
   reinforcement loop is observable.
5. New unit test: scripted run of N outcomes triggers exactly
   `floor(N/50)` background `train()` calls + final `flush()` on
   reset.

**Cost:** M. Small library docstring update on `Learner.score()`'s
expected call cadence; no library code change.

**Sequencing:** Before #7 — once observed-outcome training works,
multi-output softmax (#7) becomes the natural next "what does the
network actually predict?" step.

### 8 — Richer feature vector

**Branch:** `feat/demo-richer-feature-vector`

**What:** Today's feature vector is the 5 need levels. Grow it to:

- 5 need levels (existing).
- Mood category one-hot (4 dims: happy / sad / sleepy / playful).
- Active modifier count (1 dim, normalized to [0, 1] via min(count, 5) / 5).
- Recent-event counts in the last 30 ticks per `SkillCompleted` /
  `SkillFailed` / `NeedCritical` (3 dims).

Total = 13 dims (was 5).

**Library impact:** none — `featuresOf` is already consumer-supplied.

**Breaking for old saves:** the bundled `learning.network.json`
baseline must be re-authored at the new shape. Old saved snapshots
become schema-invalid; the demo's `learning.ts` `hydrate()` already
falls back to the baseline on shape mismatch (no extra error path
needed).

**Sequencing:** After #6 — once the learner is reinforcing observed
outcomes, the richer features actually matter for visible behavior
divergence.

### 9 — Live prediction strip

**Branch:** `feat/demo-prediction-strip`

**What:** Render the network's last scalar (or, post-#7, the softmax
distribution) as a horizontal bar under the HUD, with a vertical line
at `URGENCY_THRESHOLD`. Player sees *why* the pet idled vs. acted
this tick — turns the black-box policy into an explainable one.

**Files:**

- `examples/nurture-pet/src/predictionStrip.ts` (new).
- `cognitionSwitcher.ts` — fan the per-tick prediction out via a small
  observable; the strip subscribes.
- `index.html` — anchor.

**Library impact:** none, but consider exposing a
`reasoner.lastPrediction` getter on `TfjsReasoner` if the closure
plumbing gets ugly. Defer until the demo work proves it's needed.

---

## Track C — Library seams (PRs 5, 7, 10)

### 5 — LLM provider example + README

**Branch:** `feat/llm-port-example-and-readme`

**What:** The `LlmProviderPort` + `MockLlmProvider` shipped in PR #66
have no consumer-visible documentation beyond JSDoc. Add:

- A new `README.md` section "LLM provider port (preview)" — explains
  the port's role, links to the deferred concrete adapters, shows the
  `MockLlmProvider` shape with a 5-line snippet.
- A new example under `examples/llm-mock/` — minimal Vite-free Node
  script that:
  1. Constructs a `MockLlmProvider` with a 3-script queue.
  2. Writes a tiny `LlmReasoner` adapter (`Reasoner` interface) that
     calls `provider.complete(...)` once per tick and parses the text
     into an `Intention`.
  3. Runs it through 5 ticks under `SeededRng` + `ManualClock` and
     asserts byte-identical traces across two runs.
- A line in `docs/specs/vision.md` noting that the port is shipped but
  the concrete adapters are Phase B.

**Files:**

- `README.md` (modify; ~30 lines added).
- `examples/llm-mock/index.ts` (new).
- `examples/llm-mock/package.json` (new — minimal).
- `examples/llm-mock/README.md` (new — 1-page how-to).
- `docs/specs/vision.md` — one-line clarification.

**No library change. No changeset.** Pure docs + example.

**Why now:** Owner asked to "be prepared" for LLM integration. This
exercises the surface end-to-end so any rough edges surface BEFORE
the Phase B adapter work, where API shape is harder to change.

### 7 — Multi-output softmax action selection

**Branch:** `feat/tfjs-multi-output-softmax`

**What:** The current Learning mode's `interpret` callback gates on
a scalar urgency and falls back to `topCandidate` from `NeedsPolicy`.
Replace with an N-way softmax over skills (feed / clean / play /
rest / pet / medicate / scold = 7 outputs in the demo). `interpret`
picks `argmax` directly; the heuristic fallback retires.

**Library scope (S):**

- The adapter already supports multi-dim outputs (forward pass already
  returns `dataSync()`-flattened arrays). The change is purely in the
  consumer-supplied `interpret` shape — no `TfjsReasoner` code
  changes. But add a JSDoc example to `TfjsReasoner` showing the
  N-way pattern so consumers don't have to derive it.

**Demo scope (M):**

- Re-author the bundled `learning.network.json` with a
  `[13, 16, 7]` topology (or similar — match #8's input dims).
- Update `learning.ts` `featuresOf` and `interpret` to produce / consume
  the 7-skill softmax.
- Update `cognitionSwitcher.ts` Train pairs to label each outcome with
  the executed skill's index (one-hot).
- Update tests in `tests/examples/learningMode.train.test.ts`.

**Bump:** minor (no breaking surface change; new JSDoc example only).

**Sequencing:** After #6 (`TfjsLearner` wired) and #8 (richer features) —
all three together produce a visibly different Learning mode.

### 10 — Backend probe + picker

**Branch:** `feat/tfjs-detect-backend-and-picker`

**Library scope:**

- New static `TfjsReasoner.detectBestBackend(): Promise<'webgl' |
  'wasm' | 'cpu'>` — probes in that order, returns the first that
  registers without throwing. Side-effect-imports the corresponding
  `@tensorflow/tfjs-backend-*` package (lazy dynamic `import()`).
- JSDoc invariant: GPU backends (`webgl`) are NOT determinism-
  preserving. Document that bit-identical replay is CPU-only — same
  caveat the existing `TfjsReasoner` JSDoc already carries, but
  surface it on the probe too.

**Demo scope:**

- Dropdown next to the cognition mode picker: `CPU` (default) / `WebGL`
  / `WASM`. Selecting one calls `tf.setBackend(...)` then re-
  constructs the active reasoner via the existing `mode.construct()`
  path (the cognition-switcher's `changeEpoch` + `disposeIfOwned`
  guards already handle the swap).
- Persist selection in localStorage like the speed picker.
- Disable picker options whose backend probe fails (mirrors the
  cognition mode picker's capability state).

**Bump:** minor (new public static on `TfjsReasoner`).

**Sequencing:** Before #12 (backend matrix in CI). #12 needs backend
picking to be a real consumer surface, not a contrived test.

---

## Definition of done (per-track)

### Track A — CI hygiene

- All four CI PRs merged; size comment visible on the next library PR;
  npm audit blocks a known-vuln test PR; SHA-pinning bumper script in
  `scripts/`.
- Backend + OS matrix runs on every push to `develop` + every PR.
- No regression in pre-PR `npm run verify` time on a developer machine.

### Track B — Demo polish

- Loss curve renders during a Train run; sparkline updates each epoch
  via #4's callback.
- `TfjsLearner` is wired into Learning mode; HUD shows
  `Buffered: N / 50`; the network demonstrably drifts from the
  baseline after ~5 minutes of nurture-play (manual soak, no
  automated assertion).
- Richer feature vector + multi-output softmax = visibly different
  behavior between baseline and trained network.
- Prediction strip renders every tick, with `URGENCY_THRESHOLD` line
  visible.

### Track C — Library seams

- LLM example runs `npm install && npm start` under `examples/llm-mock/`
  end-to-end; deterministic-replay assertion green.
- Multi-output softmax adapter pattern documented in `TfjsReasoner`
  JSDoc with a copy-pasteable snippet.
- Backend picker exposes CPU / WASM / WebGL where available; demo's
  `analyze` script reports no bundle-size regression beyond the
  budget raise (pre-allocated 7 KB on the tfjs subpath).

---

## Plan-chunking table

Each numbered increment below gets its own self-contained task list when
picked up. This roadmap is the **superplan**; per-PR plans live in
sibling `docs/plans/YYYY-MM-DD-<slug>.md` files when their scope warrants
one.

| #   | Branch                                       | Plan file (when needed)                            | Status      |
| --- | -------------------------------------------- | -------------------------------------------------- | ----------- |
| 1   | `chore/ci-dry-release-and-size-comment`      | inline (XS)                                        | Not started |
| 2   | `chore/ci-npm-audit-gate`                    | inline (XS)                                        | Not started |
| 3   | `feat/demo-loss-curve`                       | inline (S)                                         | Not started |
| 4   | `feat/demo-train-epoch-progress`             | inline (XS+XS, bundled)                            | Not started |
| 5   | `feat/llm-port-example-and-readme`           | inline (S)                                         | Not started |
| 6   | `feat/tfjs-learner-in-demo`                  | draft per-PR plan first                            | Not started |
| 7   | `feat/tfjs-multi-output-softmax`             | draft per-PR plan first                            | Not started |
| 8   | `feat/demo-richer-feature-vector`            | inline (S)                                         | Not started |
| 9   | `feat/demo-prediction-strip`                 | inline (S)                                         | Not started |
| 10  | `feat/tfjs-detect-backend-and-picker`        | inline (S+S)                                       | Not started |
| 11  | `chore/ci-actions-sha-pinning`               | inline (S)                                         | Not started |
| 12  | `chore/ci-backend-and-os-matrix`             | inline (M; depends on #10 shipped)                 | Not started |

---

## Open questions

1. **Where does `TfjsLearner`'s reward come from in #6?** Two options:
   (a) deterministic from the `SkillCompleted` event's effectiveness
   field; (b) consumer-supplied via a `rewardOf(outcome)` projection
   passed to `toTrainingPair`. Defaulting to (b) keeps the lib
   consumer-driven, which matches the rest of the cognition surface.
   Confirm during the per-PR plan for #6.

2. **Multi-output softmax target shape.** The 7 default skills are
   `feed / clean / play / rest / pet / medicate / scold`. The expression
   skills (`meow / sad / sleepy`) live in a separate module. Decide:
   include them in the softmax (10-way) or keep them as the heuristic
   reactive layer? Confirm during the per-PR plan for #7.

3. **Backend picker UX.** Show the 3-way picker always (with disabled
   options) like the cognition picker, or hide unavailable backends?
   The cognition picker pattern is "show + disable + tooltip" — likely
   correct here too for educational value. Confirm during #10.

4. **LLM example placement.** `examples/llm-mock/` as a sibling to
   `examples/nurture-pet/`, or as a `tests/examples/` integration
   asserting deterministic replay? The README points to it, so a
   sibling example is more discoverable. Confirm during #5.

---

## How to pick this up next session

1. Read this file + `MEMORY.md → project_v1_release_hold.md`.
2. Pick a branch from the "Sequencing at a glance" table — recommended
   start is **#1** (DRY release.yml + size-comment), it's XS and
   immediately tightens the loop for every subsequent PR.
3. Cut the topic branch from `develop`. Implement. `npm run verify`
   green. Open PR. Wait for Codex review (~5 minutes). Address
   findings. Owner merges. Pull + prune + delete local branch.
4. Move to next branch. Don't stack. Don't pull in items from a later
   row unless its row's "Depends on" column is satisfied.

The 1.0 publish stays held until the owner explicitly signals; this
roadmap explicitly does not include it.
