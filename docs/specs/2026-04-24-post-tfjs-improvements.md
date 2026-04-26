# Post-tfjs improvements — roadmap

> Written 2026-04-24 on the topic branch `feat/tfjs-cognition-adapter`
> (PR #60) during the thorough post-migration review. Captures follow-up
> work that is **unblocked** by the brainjs → tfjs swap but was
> deliberately left out of that PR to keep the scope honest.
>
> Each item carries:
>
> - **Value** — why it's worth doing now vs. before.
> - **Cost** — rough size (XS / S / M / L).
> - **Unblocked by** — the specific brainjs constraint that no longer
>   applies.
> - **Depends on / Sequencing** — ordering notes.

## Background

The brain.js adapter was a stub-only inference wrapper: no `train()`,
no deterministic persistence, no disposal, no backend choice. Anything
touching those surfaces either lived in the consumer (demo) or simply
didn't exist. The tfjs adapter now owns the full lifecycle, which
opens real work that was previously unviable.

---

## 1. Library — core seams

### 1.1 `TfjsLearner` — concrete `Learner` for Stage-8 scoring

- **Value.** `src/cognition/learning/Learner.ts` has been a stub seam
  with `NoopLearner` as the only implementation since Phase A. With
  a real `train()` in the adapter, a `TfjsLearner` can collect
  `LearningOutcome`s on `SkillCompleted` / `SkillFailed` into a
  ring buffer, batch-train a `TfjsReasoner` every N outcomes, and
  close the reinforcement loop the port was designed for.
- **Cost.** S — ~100 LOC + tests. Living in
  `src/cognition/adapters/tfjs/TfjsLearner.ts` as a sibling of
  `TfjsReasoner`.
- **Unblocked by.** brain.js had no seeded training; a Learner
  backed by it would have smuggled `Math.random` into the tick
  loop, breaking determinism.
- **Sequencing.** Requires an agreed reward-signal schema on
  `LearningOutcome.reward` (currently `number | undefined`). Write
  that spec first; implement after.

### 1.2 Multi-output softmax action selection

- **Value.** `selectIntention`'s `interpret` callback currently gates
  on a scalar urgency and falls back to `topCandidate` from
  `NeedsPolicy`. Training can replace the heuristic entirely: an
  N-way softmax over skills (`feed / clean / play / rest / pet /
  medicate / scold` in the demo) lets `interpret` pick `argmax`
  directly, removing the fallback and making the adapter the actual
  policy.
- **Cost.** S at the adapter level (it's all in `interpret`), M for
  the demo rewiring + tests.
- **Unblocked by.** brain.js's abandoned state meant no one was
  willing to invest in a real trained policy. tfjs's active
  maintenance + documented determinism make this worth the effort.

### 1.3 Batch inference across agents

- **Value.** sim-ecs / multi-agent consumers currently tick one
  `selectIntention` per agent per tick. `featuresOf` can return a
  `tf.Tensor` of shape `[N, inputDim]` and `interpret` a
  `[N, outputDim]` result, letting a consumer predict a whole
  population in one `model.predict` call. Order of magnitude
  speed-up for the cases it applies to.
- **Cost.** XS at the adapter (the tensor pipeline already supports
  this — see the `tf.Tensor` branch of `toInputTensor`); M for the
  sim-ecs integration that actually uses it.
- **Unblocked by.** brain.js's `run` was single-sample only.

### 1.4 Pretrained / transfer-learning hydration

- **Value.** Consumers can export a TensorFlow SavedModel offline,
  convert via `tfjs-converter`, and ship the resulting JSON as the
  `learning.network.json` baseline. Agents boot with a non-trivial
  policy from day one.
- **Cost.** XS in the adapter (works today — `fromJSON` takes any
  `TfjsSnapshot`-shaped object); docs + example = S.
- **Unblocked by.** brain.js had no model-interchange format; its
  `toJSON` / `fromJSON` was a proprietary shape only it understood.

### 1.5 Deterministic training trajectory in snapshots

- **Value.** `AgentSnapshot` currently captures needs / modifiers /
  mood / lifecycle but not the reasoner's weights. With
  `TfjsReasoner` deterministic under seed, we can now version a
  `trainedSnapshot` field on the agent snapshot + a `trainCount`
  so replay reconstructs the exact trained model at any historical
  tick.
- **Cost.** M — touches the snapshot versioning scheme (bump
  `AgentSnapshot.version`, write a migration), plus integration in
  the autosave path so it actually persists.
- **Depends on.** R-08 (per-subsystem snapshot versioning, deferred
  at Phase A MVP). If R-08 lands first, this becomes a local
  addition; otherwise, it pulls the whole schema forward.

### 1.6 WebGL / WebGPU backend probe

- **Value.** `TfjsReasonerOptions.backend` already supports
  `'cpu' | 'wasm' | 'webgl'`. The demo could detect the fastest
  available backend and route inference / training through it.
  10-100× speed-up on browsers that have it.
- **Cost.** S — a new `TfjsReasoner.detectBestBackend()` static +
  demo probe order.
- **Caveat.** Determinism contract weakens on GPU backends —
  document that bit-identical replay is CPU-only.

---

## 2. Demo — examples/nurture-pet

The demo currently shows training happened (Train button flashes
"Trained ✓") but doesn't *visualise* it. tfjs's real `history.loss`
stream opens several wins.

### 2.1 Observable training curve

- **Value.** `TfjsReasoner.train()` returns `{ finalLoss, history:
  { loss } }`. Render the loss series as a sparkline under the Train
  button — the player sees the number drop, learning becomes
  visible evidence not mystery.
- **Cost.** S. An SVG sparkline + `requestAnimationFrame` isn't much.
- **Sequencing.** Do before 2.2 — 2.2 is a refinement.

### 2.2 Per-epoch progress callback

- **Value.** `model.fit` accepts `callbacks: { onEpochEnd }`. The
  button could read `Training… 42/100` with a live progress bar
  instead of a blocking spinner. `TfjsReasoner.train` needs a new
  `onEpochEnd?: (epoch: number, loss: number) => void` option.
- **Cost.** XS in the adapter, XS in the demo.

### 2.3 Loss delta toast

- **Value.** After training: "Trained ✓ — loss 0.42 → 0.08". One
  line, concrete feedback, zero chart real-estate.
- **Cost.** XS.

### 2.4 Richer feature vector

- **Value.** Today's features are the 5 need levels. Adding mood
  category (one-hot 4), active modifier count, recent-event counts
  gives the network meaningful signal — you can tell a sad pet from
  a sick one with this vector. Currently it can't.
- **Cost.** S — grow the baseline shape, retrain / re-author the
  bundled `learning.network.json`.
- **Breaking.** Yes — old saved snapshots become schema-invalid,
  but the demo already falls back to the baseline on shape mismatch
  (see `learning.ts` `hydrate` try/catch).

### 2.5 Untrain / Reset-model button

- **Value.** Reset today wipes the whole agent. An "Untrain" action
  that only clears `agentonomous/<id>/tfjs-network` and rehydrates
  from the bundled baseline is much less destructive and matches
  the "undo training" intuition.
- **Cost.** XS.

### 2.6 Live prediction strip

- **Value.** Render the last scalar output + the `URGENCY_THRESHOLD`
  line so the player sees *why* the pet idled or acted this tick.
  Turns the black-box policy into an explainable one. Ties in
  nicely with the existing `DecisionTrace` viewer.
- **Cost.** S.

### 2.7 Backend picker (ties to 1.6)

- **Value.** Dropdown next to the mode picker: `CPU / WebGL`.
  Immediate speed comparison, educational.
- **Cost.** S (depends on 1.6).

---

## 3. Build / CI / pipelines

### 3.1 Coverage upload

- **Value.** `npm run test:coverage` runs on every CI test job and
  emits lcov + html, but nothing consumes the output. Either:
  (a) wire Codecov / GitHub coverage upload, or
  (b) drop `:coverage` from CI and save the ~2–4 s per run.
- **Cost.** XS either way.

### 3.2 DRY `release.yml`

- **Value.** The release workflow inlines format/lint/typecheck/
  test/build instead of calling `npm run verify`. If the verify
  script grows (and it will when we add `demo-build`), the release
  pipeline drifts. One-line fix.
- **Cost.** XS.

### 3.3 Bundle-size delta comment

- **Value.** `size-limit` already enforces the budget in CI. A PR
  comment from `andresz1/size-limit-action` that shows before /
  after deltas would surface regressions earlier.
- **Cost.** XS.

### 3.4 `npm audit` gate

- **Value.** brain.js's 10-CVE chain slipped in because no one ran
  audit in CI. Add a `npm audit --omit=dev --audit-level=high` step
  as a blocker; stops the next similar regression.
- **Cost.** XS.

### 3.5 Actions SHA pinning

- **Value.** Supply-chain rigor. `actions/checkout@v6` pins to a
  mutable tag; SHA-pinning closes that gap.
- **Cost.** S (batch find + replace + a pin-bumper script).
- **When.** Low priority until we have a published release; before
  that, actions compromise is not yet a real threat model.

### 3.6 Adapter backend matrix

- **Value.** Today's CI runs tfjs under CPU only. A matrix job that
  also runs under WASM (pure-JS, no native deps) surfaces
  backend-specific regressions. WebGL can't run on headless
  runners without significant extra work, so skip that.
- **Cost.** S.
- **When.** After 1.6 lands — matrix makes sense once consumers
  actually pick backends.

### 3.7 Windows / macOS runners

- **Value.** brain.js's `gl` chain needed native headers, so we
  avoided non-Linux runners. tfjs is pure-JS. A macos-latest /
  windows-latest cross-check job in the `test` matrix catches
  platform surprises early.
- **Cost.** S — costs one extra minute of runner time per push.

---

## 3A. Pre-existing tech debt (unblocks but doesn't belong to the tfjs migration)

These existed before the brainjs swap and were NOT introduced by it.
Logged here so a later pass can close them in one sweep instead of
surfacing on every IDE reopen.

### 3A.1 Demo `js-son-agent` ambient-module gap

- **Symptom.** `cd examples/nurture-pet && npx tsc --noEmit` reports
  four `TS7016 Could not find a declaration file for module
  'js-son-agent'` errors in `src/cognition/bdi.ts` and the
  transitively-referenced `src/cognition/adapters/js-son/*.ts`.
- **Why it exists.** The root workspace carries an ambient shim
  (`src/cognition/adapters/js-son/js-son-agent.d.ts`, copied into
  `dist/` by the vite ambient-dts plugin) but the demo's
  `tsconfig.json` `include` only covers `examples/nurture-pet/src/**/*`
  — the shim lives outside that scope. When the demo tsc reaches into
  `../../src/cognition/adapters/js-son/` via `paths`, it sees the TS
  source but the ambient module declaration is out of reach.
- **Fix options (pick one).**
  (a) Extend demo tsconfig's `include` to pull in the shim file only
  (`"../../src/cognition/adapters/js-son/js-son-agent.d.ts"`).
  (b) Put a copy of the ambient shim in `examples/nurture-pet/src/`
  scoped to the demo.
  (c) Let the demo target the built `dist/` via `paths` pointing at
  `../../dist/...` — would mirror production resolution and the
  ambient `/// <reference>` the copy plugin already prepends takes
  effect.
- **Cost.** XS (a) / S (c).
- **Unblocked by.** Nothing — orthogonal to the tfjs work.

### 3A.2 `vite.config.ts` `test` key typing

Already fixed on `fix/ide-red-marks-vite-tsconfig` (PR #61) — switched
`defineConfig` import to `vitest/config`. Keeping a breadcrumb here
in case the wrapper doc is read before that PR lands.

### 3A.3 Demo tsconfig `baseUrl` deprecation

Already fixed on the same PR #61 — dropped `baseUrl: "."`. `paths`
resolves relative to tsconfig under `moduleResolution: Bundler`. Zero
behaviour change, silences the TS 7.0 deprecation note.

---

## 4. Out of scope / deferred

- **Replacing `UrgencyReasoner` with a trained tfjs model by
  default.** That's a behavior change. Out of scope until we ship
  a release and can signal major-version intent.
- **Writing a `ReinforcementLoop` module** that unifies 1.1 + 1.2.
  Valuable but wider than one PR — draft a spec first.
- **Removing `NoopLearner`.** Keep as zero-config default; only its
  _advertised_ rationale changes (see updated
  `src/cognition/learning/Learner.ts` docblock on this branch).

---

## Recommended order

1. **3A.1** (demo js-son-agent ambient shim) — one-line tsconfig change, gets the demo's local tsc clean.
2. **3.2** (DRY release) + **3.3** (size-limit comment) — tiny, make CI loop tighter immediately.
3. **2.3** (loss toast) + **2.5** (Untrain button) — XS wins, ship one demo PR.
4. **2.1** (loss curve) — makes training a feature, not plumbing.
5. **2.2** (epoch progress) — polish on top of 2.1.
6. **1.2** (multi-output softmax) + **2.4** (richer features) — bundled PR; changes what the network *is*.
7. **1.1** (`TfjsLearner`) — closes the Learner seam.
8. **1.5** (snapshot versioning of weights) — gated on R-08.
9. **1.6** (WebGL backend) + **2.7** (backend picker) — bundled PR.
10. **3.4** (`npm audit` gate) — ship once we have a stable transitive tree.
11. **3.6** + **3.7** (matrix / OS) — nice-to-haves for pre-1.0.

Everything except (8) can land on `develop` today. (8) waits on R-08.
