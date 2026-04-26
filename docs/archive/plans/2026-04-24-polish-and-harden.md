> **Archived 2026-04-26.** Superseded by docs/plans/2026-04-25-comprehensive-polish-and-harden.md (the 2026-04-25 plan supersedes this file explicitly in its header).

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

1. **Remediate four persistence/restore findings** flagged in a 2026-04-24
   review (3 majors + 1 minor). These are correctness + safety bugs
   that should land BEFORE polish work — a stale modifier after restore
   or a localStorage key collision corrupts state in ways the demo
   work would amplify.
2. **Polish the demo** so a visitor sees the value (cognition is real,
   training is observable, decisions are explainable) within 30 seconds.
3. **Harden CI** so regressions surface earlier — bundle-size deltas,
   npm-audit gating, OS / backend matrix.
4. **Prep for LLM provider integration** without shipping a concrete
   adapter. The `LlmProviderPort` + `MockLlmProvider` (PR #66) are the
   1.0 contract; this roadmap lands documentation + an example wiring
   so the surface is exercised before Phase B's `AnthropicLlmProvider`
   / `OpenAiLlmProvider` work.
5. **Close the reinforcement loop** by wiring `TfjsLearner` (PR #70)
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

Four tracks. Remediation lands first — it's correctness work that the
later tracks would otherwise silently ride on top of. Then CI hygiene,
demo polish, library seams.

| #   | Track    | Branch                                              | Scope                                                                       | Cost | Bump  | Spec ref                                       |
| --- | -------- | --------------------------------------------------- | --------------------------------------------------------------------------- | ---- | ----- | ---------------------------------------------- |
| 1   | remedy   | `fix/agent-restore-replace-modifiers`               | Restore wipes pre-existing modifiers before applying snapshot's             | S    | patch | review §PR-1 (MAJOR)                           |
| 2   | remedy   | `fix/localstorage-store-keyspace-collision`         | Split `__agentonomous/data/` from `__agentonomous/meta/` in localStorage    | M    | minor | review §PR-2 (MAJOR)                           |
| 3   | remedy   | `fix/pick-default-store-throwing-localstorage`      | `pickDefaultSnapshotStore` survives throwing `localStorage` getters         | XS   | patch | review §PR-3 (MAJOR)                           |
| 4   | remedy   | `fix/fs-store-deterministic-list-order`             | `FsSnapshotStore.list()` returns `localeCompare`-sorted keys                | XS   | patch | review §PR-4 (MINOR)                           |
| 5   | CI       | `chore/ci-dry-release-and-size-comment`             | DRY release.yml + size-limit-action PR comment                              | XS   | —     | post-tfjs §3.2 + §3.3                          |
| 6   | CI       | `chore/ci-npm-audit-gate`                           | `npm audit --audit-level=high` blocking step                                | XS   | —     | post-tfjs §3.4                                 |
| 7   | demo     | `feat/demo-loss-curve`                              | SVG sparkline of `history.loss` under the Train button                      | S    | —     | post-tfjs §2.1                                 |
| 8   | demo     | `feat/demo-train-epoch-progress`                    | `TfjsReasoner.train` exposes `onEpochEnd`; demo renders `Training… 42/100`  | XS+XS| minor | post-tfjs §2.2                                 |
| 9   | lib      | `feat/llm-port-example-and-readme`                  | README LLM section + `examples/llm-mock/` minimal MockLlmProvider playback  | S    | —     | this roadmap (LLM-prep)                        |
| 10  | demo+lib | `feat/tfjs-learner-in-demo`                         | Wire `TfjsLearner` to demo's Learning mode; observed skills feed training   | M    | —     | post-tfjs §1.1 follow-up                       |
| 11  | lib      | `feat/tfjs-multi-output-softmax`                    | N-way softmax over skills; `interpret` picks `argmax`; demo retrains        | S+M  | minor | post-tfjs §1.2                                 |
| 12  | demo     | `feat/demo-richer-feature-vector`                   | Add mood + modifier-count + recent-events to the feature vector             | S    | —     | post-tfjs §2.4                                 |
| 13  | demo     | `feat/demo-prediction-strip`                        | HUD strip showing last scalar output + URGENCY_THRESHOLD line               | S    | —     | post-tfjs §2.6                                 |
| 14  | lib      | `feat/tfjs-detect-backend-and-picker`               | `TfjsReasoner.detectBestBackend()` + demo backend dropdown                  | S+S  | minor | post-tfjs §1.6 + §2.7                          |
| 15  | CI       | `chore/ci-actions-sha-pinning`                      | SHA-pin `actions/checkout` etc.                                             | S    | —     | post-tfjs §3.5                                 |
| 16  | CI       | `chore/ci-backend-and-os-matrix`                    | tfjs CPU + WASM job; macos-latest + windows-latest checks                   | M    | —     | post-tfjs §3.6 + §3.7                          |

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12
→ 13 → 14 → 15 → 16. Remediation first (correctness; one PR per finding
per the review's guardrail). CI hygiene next (cheap; tightens the loop).
Demo wins after that (visible value, drives the Learning-mode story).
Lib seams in the middle. Backend + OS matrix last (depends on §14's
backend picker landing first).

**Per-finding-per-PR is non-negotiable for the remediation track.** The
review explicitly forbade bundling: "If you combine them, review quality
drops and regressions hide." Each remediation PR must include its
regression tests in the same diff.

---

## Track A — Remediation (PRs 1–4, must land first)

Source: standalone code review delivered 2026-04-24, four findings
against `src/agent/Agent.ts` + `src/persistence/*`. Three majors + one
minor. Owner instruction is one PR per finding — no bundling — with
regression tests in the same diff.

### 1 — Restore must replace modifier state

**Branch:** `fix/agent-restore-replace-modifiers`

**Severity:** MAJOR (correctness).

**Problem.** `Agent.restore()`'s contract says "replaces the relevant
state slices" (`src/agent/Agent.ts:665-667`), but the modifiers branch
(`:707-727`) currently merges by calling `this.modifiers.apply(mod)` for
each entry in `snapshot.modifiers` without first clearing the live
collection. Restoring into an already-running agent leaves stale
modifiers active, violating snapshot truth and causing behavior drift —
needs decay multipliers and mood biases stack on top of whatever the
agent was already carrying.

**Fix.** Clear current modifiers before applying the snapshot's:

```ts
if (snapshot.modifiers) {
  // Replace, don't merge — see review §PR-1.
  for (const existing of this.modifiers.list()) {
    this.modifiers.removeAll(existing.id);
  }

  const nowMs = this.clock.now();
  for (const mod of snapshot.modifiers) {
    if (mod.expiresAt !== undefined && mod.expiresAt <= nowMs) {
      this.publish({
        // existing ModifierExpired publish payload — keep verbatim
      });
      continue;
    }
    this.modifiers.apply(mod);
  }
}
```

**Files:**

- Modify: `src/agent/Agent.ts:707-727` (the `if (snapshot.modifiers)`
  block in `restore()`).
- Test: `tests/unit/agent/Agent-persistence.test.ts` — new case where
  the target agent has pre-existing modifiers (apply two before
  `restore()`); assert they are gone after restore unless the
  snapshot includes them. Keep existing expiry-boundary assertions
  intact.

**Changeset:** patch (bug fix; behavior was contractually wrong).

**Bump:** patch.

**DoD:**

- New test fails on `develop` head before the fix; passes after.
- Existing expiry-boundary tests still pass unchanged.
- Public `restore()` JSDoc reads cleanly — no contract change, just an
  accurate one.

### 2 — LocalStorage keyspace separation

**Branch:** `fix/localstorage-store-keyspace-collision`

**Severity:** MAJOR (correctness / safety).

**Problem.** `src/persistence/LocalStorageSnapshotStore.ts:4,44,81-85,
91-92` shares one key namespace for both data and the index metadata:

```ts
const INDEX_KEY = '__agentonomous/index__';
this.storage.setItem(this.prefix + key, JSON.stringify(snapshot));
const raw = this.storage.getItem(this.prefix + INDEX_KEY);
```

A consumer who passes `key = '__agentonomous/index__'` to `save()`
silently overwrites the index metadata. `list()` then returns garbage
and the snapshot becomes unreachable.

**Fix.** Split data from metadata into separate sub-namespaces, and
URL-encode user-supplied keys so colliding strings can't escape the
data subspace:

```ts
const META_INDEX_KEY = '__agentonomous/meta/index';
const DATA_PREFIX = '__agentonomous/data/';

// save:
const storageKey = this.prefix + DATA_PREFIX + encodeURIComponent(key);
this.storage.setItem(storageKey, JSON.stringify(snapshot));

// load / delete: same encoding.

// list / index reads:
const raw = this.storage.getItem(this.prefix + META_INDEX_KEY);
```

Apply `decodeURIComponent` symmetrically on `list()` so consumers see
their original keys back.

**Migration concern.** Existing localStorage entries from a previously
shipped version live under the old `prefix + key` shape. Two options:

1. Read-once migration: on first `list()` call after the upgrade, scan
   raw localStorage for `${prefix}` entries that are NOT under
   `meta/` or `data/`, rewrite them under `data/`, drop the originals.
   Cost: ~30 LOC, one-time per browser.
2. Ship a clean break + changelog note. The lib is pre-1.0; this is
   defensible.

**Recommend option 1** — pre-1.0 doesn't excuse silent data loss for
demo users who already have a pet saved. Implement in a private
`migrateLegacyKeys()` invoked once from the constructor.

**Files:**

- Modify: `src/persistence/LocalStorageSnapshotStore.ts:4,44,81-85,91-92`
  + add `migrateLegacyKeys()` private method.
- Test: NEW file `tests/unit/persistence/LocalStorageSnapshotStore.test.ts`
  (currently no per-store unit test; the store is exercised via
  integration tests only). Cases:
  1. save / load / list / delete happy path.
  2. `key === '__agentonomous/index__'` — must save/load correctly,
     index unaffected.
  3. Malformed index payload — `list()` recovers gracefully (returns
     empty, doesn't throw).
  4. Encode/decode round-trip for special chars (`/`, `:`, ` `, `é`,
     emoji).
  5. Legacy migration — pre-populate the storage with old-format
     entries, construct the store, assert `list()` reports them under
     decoded keys + raw storage now uses `data/`.

**Changeset:** minor (storage shape changed, but the public API is
unchanged and the migration step makes it non-breaking for end users).

**Bump:** minor.

**DoD:**

- All five new test cases pass.
- Existing integration tests touching `LocalStorageSnapshotStore` pass
  unchanged.
- `npm run analyze` shows no meaningful gzip regression on the core
  bundle.

### 3 — Default store detection survives throwing localStorage

**Branch:** `fix/pick-default-store-throwing-localstorage`

**Severity:** MAJOR (robustness).

**Problem.** `src/persistence/pickDefaultSnapshotStore.ts:31-35` reads
`globalThis.localStorage` without a try-guard:

```ts
const g = globalThis as { localStorage?: unknown };
return typeof g.localStorage === 'object' && g.localStorage !== null;
```

Some browser environments expose a throwing getter for
`localStorage` (e.g. third-party iframes blocked by SecurityError,
private mode in some browsers). Reading the property throws, which
crashes store selection before the `InMemorySnapshotStore` fallback
can fire.

**Fix.** Guard the access:

```ts
function hasBrowserLocalStorage(): boolean {
  if (typeof globalThis === 'undefined') return false;
  try {
    const g = globalThis as { localStorage?: unknown };
    return typeof g.localStorage === 'object' && g.localStorage !== null;
  } catch {
    return false;
  }
}
```

> **Unverified — needs a test double that throws on property access.**
> Stub `globalThis.localStorage` via `Object.defineProperty(globalThis,
> 'localStorage', { get() { throw new Error('SecurityError'); } })` in
> the test; restore in `afterEach`.

**Files:**

- Modify: `src/persistence/pickDefaultSnapshotStore.ts:31-35`.
- Test: extend `tests/unit/persistence/pickDefaultSnapshotStore.test.ts`
  with one case:
  - Define a throwing `localStorage` getter on `globalThis` for the
    test scope.
  - Assert `pickDefaultSnapshotStore()` returns
    `InMemorySnapshotStore`, does NOT throw.

**Changeset:** patch.

**Bump:** patch.

**DoD:**

- New test fails on `develop` head before the fix; passes after.
- Existing `pickDefaultSnapshotStore` tests still pass.
- One negative test added (per the review's guardrail).

### 4 — `FsSnapshotStore.list()` deterministic ordering

**Branch:** `fix/fs-store-deterministic-list-order`

**Severity:** MINOR (determinism).

**Problem.** `src/persistence/FsSnapshotStore.ts:58-71` returns the raw
`readdir()` order, which differs by filesystem and platform. Consumers
of `list()` get unstable behavior across environments — a Linux CI run
and a Windows developer machine produce different lists.

**Fix.** Sort with `localeCompare` before returning:

```ts
out.sort((a, b) => a.localeCompare(b));
return out;
```

**Files:**

- Modify: `src/persistence/FsSnapshotStore.ts:58-71` (after the
  decode loop, before `return out`).
- Test: extend `tests/unit/persistence/FsSnapshotStore.test.ts` with a
  case that mocks `readdir` to return an unsorted response (e.g.
  `['c', 'a', 'b']`); assert `list()` returns
  `['a', 'b', 'c']`.

**Changeset:** patch.

**Bump:** patch.

**DoD:**

- New test fails on `develop` head before the fix; passes after.
- Existing `FsSnapshotStore` tests still pass.

### Track A guardrails (apply to all four PRs)

Verbatim from the review:

- **Do not mix unrelated fixes in one diff.** One finding = one branch
  = one PR.
- **Behavior change in persistence/restore must include tests in the
  same PR.** No "follow-up test PR" — the test ships with the fix.
- **Public API changes explicit in PR descriptions.** PR #2 (key-space
  split + migration) is the only one with a consumer-visible behavior
  change; spell it out in the PR body.
- **Add one negative test per new branch / error path.** PR #3's
  throwing-getter case satisfies this; PR #2 adds the malformed-index
  recovery case; PR #1 adds the pre-existing-modifier case; PR #4 adds
  the unsorted-readdir case.

---

## Track B — CI hygiene (PRs 5, 6, 15, 16)

### 5 — DRY release.yml + size-limit PR comment

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

### 6 — `npm audit` gate

**Branch:** `chore/ci-npm-audit-gate`

**What:** Add `npm audit --omit=dev --audit-level=high` step to the PR
CI. Blocking. Closes the brain.js-style supply-chain hole that slipped
in last time.

**Files:**

- `.github/workflows/ci.yml`.

**DoD:** A test PR that adds a known-vulnerable dep fails the gate.
Current `develop` (post-tfjs swap) passes.

### 15 — Actions SHA pinning

**Branch:** `chore/ci-actions-sha-pinning`

**What:** Replace mutable tags (`actions/checkout@v6`, etc.) with full
40-char commit SHAs. Add a one-line bumper script under `scripts/` so
future updates don't bit-rot.

**When:** Low priority until 1.0 is on the horizon — this is supply-
chain rigor for a published library, not a development necessity.

### 16 — Backend + OS matrix

**Branch:** `chore/ci-backend-and-os-matrix`

**Depends on:** PR #14 (backend picker) so the matrix has a real
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

## Track C — Demo polish (PRs 7, 8, 10, 12, 13)

### 7 — Loss curve sparkline

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

**Sequencing:** Do before #8 — #8 builds the live progress on the same
plumbing.

### 8 — Per-epoch progress callback

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
  button text (`Training… 42/100`) and (if PR #7 landed) push points
  into the sparkline mid-fit.

**Cost:** XS adapter, XS demo. Two PRs OR one bundled (callback is
small). Recommend bundled — same ceremony, less switching overhead.

**Bump:** minor (additive `TrainOptions` field).

### 10 — `TfjsLearner` wired into demo Learning mode

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

**Sequencing:** Before #11 — once observed-outcome training works,
multi-output softmax (#11) becomes the natural next "what does the
network actually predict?" step.

### 12 — Richer feature vector

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

**Sequencing:** After #10 — once the learner is reinforcing observed
outcomes, the richer features actually matter for visible behavior
divergence.

### 13 — Live prediction strip

**Branch:** `feat/demo-prediction-strip`

**What:** Render the network's last scalar (or, post-#11, the softmax
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

## Track D — Library seams (PRs 9, 11, 14)

### 9 — LLM provider example + README

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

### 11 — Multi-output softmax action selection

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

**Sequencing:** After #10 (`TfjsLearner` wired) and #12 (richer features) —
all three together produce a visibly different Learning mode.

### 14 — Backend probe + picker

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

**Sequencing:** Before #16 (backend matrix in CI). #16 needs backend
picking to be a real consumer surface, not a contrived test.

---

## Definition of done (per-track)

### Track A — Remediation

- All four remediation PRs merged in order (1 → 2 → 3 → 4), each with
  its regression test in the same diff.
- `Agent.restore()` test now covers the pre-existing-modifier replace
  contract.
- `LocalStorageSnapshotStore` test file exists with at least the five
  cases from PR #2's plan; legacy migration is exercised end-to-end.
- `pickDefaultSnapshotStore()` no longer crashes when
  `globalThis.localStorage` is a throwing getter.
- `FsSnapshotStore.list()` returns `localeCompare`-sorted keys across
  all platforms.

### Track B — CI hygiene

- All four CI PRs merged; size comment visible on the next library PR;
  npm audit blocks a known-vuln test PR; SHA-pinning bumper script in
  `scripts/`.
- Backend + OS matrix runs on every push to `develop` + every PR.
- No regression in pre-PR `npm run verify` time on a developer machine.

### Track C — Demo polish

- Loss curve renders during a Train run; sparkline updates each epoch
  via #8's callback.
- `TfjsLearner` is wired into Learning mode; HUD shows
  `Buffered: N / 50`; the network demonstrably drifts from the
  baseline after ~5 minutes of nurture-play (manual soak, no
  automated assertion).
- Richer feature vector + multi-output softmax = visibly different
  behavior between baseline and trained network.
- Prediction strip renders every tick, with `URGENCY_THRESHOLD` line
  visible.

### Track D — Library seams

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

| #   | Branch                                              | Plan file (when needed)                            | Status      |
| --- | --------------------------------------------------- | -------------------------------------------------- | ----------- |
| 1   | `fix/agent-restore-replace-modifiers`               | inline (S)                                         | Not started |
| 2   | `fix/localstorage-store-keyspace-collision`         | draft per-PR plan first (migration step)           | Not started |
| 3   | `fix/pick-default-store-throwing-localstorage`      | inline (XS)                                        | Not started |
| 4   | `fix/fs-store-deterministic-list-order`             | inline (XS)                                        | Not started |
| 5   | `chore/ci-dry-release-and-size-comment`             | inline (XS)                                        | Not started |
| 6   | `chore/ci-npm-audit-gate`                           | inline (XS)                                        | Not started |
| 7   | `feat/demo-loss-curve`                              | inline (S)                                         | Not started |
| 8   | `feat/demo-train-epoch-progress`                    | inline (XS+XS, bundled)                            | Not started |
| 9   | `feat/llm-port-example-and-readme`                  | inline (S)                                         | Not started |
| 10  | `feat/tfjs-learner-in-demo`                         | draft per-PR plan first                            | Not started |
| 11  | `feat/tfjs-multi-output-softmax`                    | draft per-PR plan first                            | Not started |
| 12  | `feat/demo-richer-feature-vector`                   | inline (S)                                         | Not started |
| 13  | `feat/demo-prediction-strip`                        | inline (S)                                         | Not started |
| 14  | `feat/tfjs-detect-backend-and-picker`               | inline (S+S)                                       | Not started |
| 15  | `chore/ci-actions-sha-pinning`                      | inline (S)                                         | Not started |
| 16  | `chore/ci-backend-and-os-matrix`                    | inline (M; depends on #14 shipped)                 | Not started |

---

## Open questions

1. **PR #2 migration strategy.** Read-once migration on first `list()`
   (recommended) vs. clean break + changelog note. Owner already
   signalled "polish + harden, don't lose user data" so option 1 is the
   default. Confirm during the per-PR plan.

2. **Where does `TfjsLearner`'s reward come from in #10?** Two options:
   (a) deterministic from the `SkillCompleted` event's effectiveness
   field; (b) consumer-supplied via a `rewardOf(outcome)` projection
   passed to `toTrainingPair`. Defaulting to (b) keeps the lib
   consumer-driven, which matches the rest of the cognition surface.
   Confirm during the per-PR plan for #10.

3. **Multi-output softmax target shape.** The 7 default skills are
   `feed / clean / play / rest / pet / medicate / scold`. The expression
   skills (`meow / sad / sleepy`) live in a separate module. Decide:
   include them in the softmax (10-way) or keep them as the heuristic
   reactive layer? Confirm during the per-PR plan for #11.

4. **Backend picker UX.** Show the 3-way picker always (with disabled
   options) like the cognition picker, or hide unavailable backends?
   The cognition picker pattern is "show + disable + tooltip" — likely
   correct here too for educational value. Confirm during #14.

5. **LLM example placement.** `examples/llm-mock/` as a sibling to
   `examples/nurture-pet/`, or as a `tests/examples/` integration
   asserting deterministic replay? The README points to it, so a
   sibling example is more discoverable. Confirm during #9.

---

## Workflow — independent PRs, batch open, multi-pass Codex resolution

The whole roadmap follows the same per-PR loop. Codified for every
session:

1. **Independent branches.** Each row's branch is cut fresh from
   `develop`. Never stack branches. Never pull row N+1's work into row
   N's PR. If two rows happen to touch the same file (rare), still cut
   them separately and rebase the second after the first merges.
2. **Batch execution, batch open.** A session can ship multiple PRs in
   one go — implement each in turn, push, open PR. Do NOT wait
   serially for Codex on each before starting the next. Open all the
   independent PRs the session covers, THEN switch into review mode.
3. **Multi-pass Codex resolution.** Once PRs are open, sweep them PR
   by PR:
   - `gh pr view <num> --comments` + `gh api repos/<org>/<repo>/pulls/<num>/comments`
     to read line comments.
   - Address real findings with a follow-up commit on the same branch.
     Push (don't rebase mid-review — line anchors break).
   - Repeat until Codex posts a 👍 reaction (`/issues/<num>/reactions`)
     on the latest commit. Codex docs: "If Codex has suggestions, it
     will comment; otherwise it will react with 👍."
   - **Skip literal re-flags** of comments you've already addressed
     after a code-level fix is in place. Note the false-positive in
     the PR description so reviewers see the rationale.
4. **Resolve the review thread.** Once Codex 👍s and the human review
   is done, mark the conversation as resolved on each thread. The bot
   keeps re-pinging open threads otherwise. Use the GitHub UI or
   `gh api graphql` to bulk-resolve.
5. **Owner merges.** Don't merge your own PRs. After merge: `git
   switch develop && git pull --ff-only origin develop && git fetch
   --prune origin && git branch -d <topic>`.

This loop is also captured in `MEMORY.md → feedback_pr_workflow.md` so
future sessions don't have to rediscover it.

## How to pick this up next session

1. Read this file + `MEMORY.md → project_v1_release_hold.md` +
   `MEMORY.md → project_codex_review.md` +
   `MEMORY.md → feedback_pr_workflow.md`.
2. **Start at row #1** (`fix/agent-restore-replace-modifiers`). The
   remediation track's four PRs land in numerical order. **Do not
   reorder them with later tracks** — they're correctness work the
   later items would silently ride on top of, and the review's
   guardrail is one PR per finding.
3. The remediation track's four PRs are independent branches but the
   sweep order matters for safety: open #1, #2, #3, #4 in one batch,
   then review-and-resolve them one at a time per the workflow above.
4. After remediation lands, pick the next batch (#5 + #6 are both XS
   CI hygiene; ship them in one session). Continue.
5. Don't stack branches. Don't pull in items from a later row unless
   its "Depends on" column is satisfied.

The 1.0 publish stays held until the owner explicitly signals; this
roadmap explicitly does not include it.
