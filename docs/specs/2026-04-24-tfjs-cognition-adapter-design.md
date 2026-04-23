# TensorFlow.js cognition adapter — design

> **Status:** draft (brainstorm complete, awaiting user + reviewer approval)
> **Target branch:** `develop`
> **Relates to:** `.claude/plans/0.9.3-brainjs-training-persistence.md` (superseded)
> **Supersedes:** `src/cognition/adapters/brainjs/`, `.changeset/cognition-adapter-brainjs.md`

## 1 — Context

The `src/cognition/adapters/brainjs/` adapter wraps a `brain.js` `NeuralNetwork`
as an agentonomous `Reasoner`. It is consumed by the nurture-pet demo's
"Learning" cognition mode, which feeds needs-levels through the network to
produce a [0, 1] urgency score that gates the current top intention.

Two independent problems make `brain.js` untenable:

1. **Unmaintained transitive chain.** `brain.js` → `gpu.js` → `gl` → `node-gyp`
   → `tar` / `cacache` / `make-fetch-happen` / `@tootallnate/once`. `npm audit`
   reports 10 vulnerabilities (2 low, 8 high) in the demo's lockfile, rooted in
   `gpu.js` (effectively abandoned upstream). The only `npm audit fix`
   available is a major downgrade to `brain.js@1.6.1` — a pre-v2 API the demo
   does not use.
2. **Install-hostile on headless CI.** `gpu.js`'s native `gl` dependency
   requires X11 build headers; the workaround today is
   `tests/examples/stubs/brain-js.ts` plus a vitest alias in
   `vite.config.ts:164-178`. Any session that regenerates `node_modules` on
   Windows without Visual Studio Build Tools also fails (regression risk every
   fresh install).

The demo's Learning mode is identified as "one of the most interesting parts
of the whole thing" — it stays. This spec replaces its backend.

## 2 — Locked-in decisions

Captured from the brainstorming Q&A (2026-04-23/24):

| # | Decision | Rationale |
|---|---|---|
| Q1 | **Clean replacement** of the brainjs adapter. | `agentonomous` is at `0.0.0` pre-release; dual-tracking an abandoned backend preserves a liability. |
| Q2 | **Adapter owns the full model lifecycle** (construct + train + persist + dispose). | Real upgrade over brainjs-era inference-only constraint. |
| Q3 | **Deterministic default, consumer-overridable.** CPU backend + seeded ops; constructor accepts `backend?` and `seed?`. | Matches agentonomous's port pattern; inference stays bit-deterministic by default; WASM/WebGL available opt-in. |
| Q4 | **`@tensorflow/tfjs-core` + `@tensorflow/tfjs-layers` + `@tensorflow/tfjs-backend-cpu`** for the demo. | Idiomatic `tf.sequential()` + `model.fit()` API; ~350–450 KB gzipped (net bundle decrease vs brain.js's ~540 KB). |
| Q5 | **Ergonomic plain-JS surface** (`train(pairs)`, `toJSON`/`fromJSON`) + `getModel()` escape hatch. | Keeps the demo's training + localStorage round-trip clean; matches other adapters' plain-callback style. |
| Q6 | **Hand-author the baseline `learning.network.json`** in the tfjs snapshot shape with today's five coefficients. | Preserves the demo's "first click feels sensible, Train button shows mutation" story with no offline-training pipeline. |
| Q7 | **Real tfjs in tests** (tfjs on root devDeps); delete the stub. | tfjs installs cleanly everywhere; no fiction to keep in sync. |

## 3 — Architecture

### 3.1 Module layout

Mirror the existing adapters' 3-file shape:

```
src/cognition/adapters/tfjs/
├── index.ts          # barrel: re-exports TfjsReasoner, options, snapshot, helpers
├── TfjsReasoner.ts   # class + TfjsReasonerOptions + TfjsHelpers + TrainOptions + TrainResult
└── TfjsSnapshot.ts   # snapshot shape + Float32Array <-> base64 codec
```

### 3.2 Public API

Consumer-facing symbols (plain-JS types per Q5):

```ts
// TfjsReasoner.ts
export interface TfjsReasonerOptions<In, Out> {
  model: tf.Sequential;                           // compiled
  featuresOf: (ctx: ReasonerContext, helpers: TfjsHelpers) => In;
  interpret: (output: Out, ctx: ReasonerContext, helpers: TfjsHelpers) => Intention | null;
  backend?: 'cpu' | 'wasm' | 'webgl';             // default 'cpu'
  seed?: number;                                  // default derived from the consumer's Rng
}

export interface TfjsHelpers {
  candidates: readonly IntentionCandidate[];
  topCandidate: (filter?: (c: IntentionCandidate) => boolean) => IntentionCandidate | null;
  needsLevels: () => Record<string, number>;
}

export interface TrainOptions {
  epochs?: number;                                // default 50
  batchSize?: number;                             // default min(pairs.length, 32)
  learningRate?: number;                          // default 0.1
  shuffle?: boolean;                              // default true, pre-shuffled
  seed?: number;                                  // overrides constructor seed for this run
}

export interface TrainResult {
  finalLoss: number;
  history: { loss: readonly number[] };
}

export class TfjsReasoner<In, Out> implements Reasoner {
  constructor(opts: TfjsReasonerOptions<In, Out>);
  selectIntention(ctx: ReasonerContext): Intention | null;
  train(pairs: Array<{ features: In; label: Out }>, opts?: TrainOptions): Promise<TrainResult>;
  toJSON(): TfjsSnapshot;
  static fromJSON<In, Out>(
    snapshot: TfjsSnapshot,
    opts: Omit<TfjsReasonerOptions<In, Out>, 'model'>,
  ): Promise<TfjsReasoner<In, Out>>;
  getModel(): tf.Sequential;
  dispose(): void;
}
```

```ts
// TfjsSnapshot.ts
export interface TfjsSnapshot {
  version: 1;
  topology: unknown;                // from model.toJSON({ keepWeightsOnly: false })
  weights: string;                  // base64(concat(Float32Array[] from model.getWeights()))
  weightsShapes: readonly (readonly number[])[];  // one shape per weight tensor
  inputKeys?: readonly string[];    // optional metadata for feature columns
  outputKeys?: readonly string[];
}
```

`TfjsHelpers` is intentionally identical in shape to `BrainJsHelpers` so
demo-style cognition adapters are swappable at call-site.

### 3.3 Subpath export

Added to `package.json` exports map and `vite.config.ts` lib entries:

```
"./cognition/adapters/tfjs": {
  "import": "./dist/cognition/adapters/tfjs/index.js",
  "types": "./dist/cognition/adapters/tfjs/index.d.ts"
}
```

`@tensorflow/tfjs-core` and `@tensorflow/tfjs-layers` are marked external in
the library build (alongside the existing `excalibur`/`mistreevous`/`js-son-agent`
entries). `dist/` stays tfjs-free.

## 4 — Determinism & training semantics

### 4.1 Backend registration

The adapter imports **only** types from `@tensorflow/tfjs-core` and
`@tensorflow/tfjs-layers`. Backend packages are registered by the consumer via
side-effect import (standard tfjs practice):

```ts
import '@tensorflow/tfjs-backend-cpu';  // consumer side — registers CPU backend
import { TfjsReasoner } from 'agentonomous/cognition/adapters/tfjs';
```

Constructor calls `tf.setBackend(opts.backend ?? 'cpu')` if and only if the
current global backend differs from the requested one. If the requested
backend is not registered, the adapter throws `TfjsBackendNotRegisteredError`
(exported) with the name of the package to install. No silent fallback —
configuration bugs should be loud.

### 4.2 Inference is bit-deterministic

`selectIntention` runs `model.predict(tensor)` — a forward pass over fixed
weights with no `Math.random`, no `Date.now()`, no `setTimeout`. Under the
default CPU backend, output is bit-identical across runs and machines. This
matches agentonomous's tick-loop contract (CLAUDE.md §Non-negotiables).

### 4.3 Training determinism

Three measures apply when `opts.seed` is provided (directly or via the
constructor default):

1. **Consumer builds the model with seeded initializers.** Documented in the
   JSDoc and demonstrated in `examples/nurture-pet/src/cognition/learning.ts`:

   ```ts
   tf.sequential({ layers: [
     tf.layers.dense({
       units: 1,
       inputShape: [5],
       activation: 'sigmoid',
       kernelInitializer: tf.initializers.glorotNormal({ seed }),
       biasInitializer: 'zeros',
     }),
   ]})
   ```

   Adapter cannot enforce this because the model is passed in pre-built; the
   JSDoc calls it out.

2. **`train()` pre-shuffles pairs with a seeded LCG** (Fisher-Yates), then
   passes `{ shuffle: false }` to `model.fit`. tfjs's built-in shuffle uses
   `Math.random` with no seed hook; pre-shuffling avoids it.

3. **Training is always async and always outside the tick loop.** The demo's
   Train button is a user-action handler, not part of `agent.tick()`. The
   library's determinism contract applies to `tick()`; `train()` is explicitly
   off that path.

### 4.4 Tensor lifecycle

`train()` wraps every tensor allocation in `tf.tidy(() => ...)` so
intermediates free synchronously. Model weights live for the reasoner's
lifetime; they get freed via `reasoner.dispose()`.

`cognitionSwitcher.onChange` gets one new call: `previousReasoner.dispose?.()`
(optional-chained so the heuristic/bt/bdi reasoners without a `dispose` method
are unaffected).

## 5 — Persistence & demo baseline

### 5.1 Snapshot flow

```
construct() — when user switches TO learning mode:
  seed = localStorage['agentonomous/<agentId>/tfjs-network']  // null if absent
  if seed present → TfjsReasoner.fromJSON(JSON.parse(seed), { featuresOf, interpret })
                    (rejection → caught → fall back to bundled baseline)
  else           → TfjsReasoner.fromJSON(bundledBaseline, { featuresOf, interpret })

Train button click:
  pairs = gather recent heuristic-labelled (needsLevels → urgency) windows
  await reasoner.train(pairs, { epochs: 200, learningRate: 0.1, seed: agent.rng.next() })
  localStorage.setItem('agentonomous/<agentId>/tfjs-network',
                       JSON.stringify(reasoner.toJSON()))
```

### 5.2 localStorage key rename

Old brain.js key: `agentonomous/<agentId>/brainjs-network`.
New tfjs key: `agentonomous/<agentId>/tfjs-network`.

No migration path. A stored brain.js blob would fail `TfjsReasoner.fromJSON`
anyway; the demo's existing try/catch falls back to the bundled baseline
silently. The demo's Reset button already purges all `agentonomous/…` keys,
handling the small number of people with stale pre-swap data.

### 5.3 Baseline `learning.network.json`

Hand-authored, ships as `examples/nurture-pet/src/cognition/learning.network.json`:

```jsonc
{
  "version": 1,
  "topology": { /* tf.Sequential config: one Dense(units:1, activation:'sigmoid', inputShape:[5]) */ },
  "weights": "<base64 of Float32Array([-1, -0.8, -0.6, -0.7, -0.9, 0])>",
  "weightsShapes": [[5, 1], [1]],
  "inputKeys":  ["hunger", "cleanliness", "happiness", "energy", "health"],
  "outputKeys": ["score"]
}
```

Same coefficients as today's brain.js baseline; same semantic (higher unmet
need → higher urgency → act). A JSDoc block in `learning.ts` shows the exact
Float32Array contents so anyone can regenerate the base64 by hand or via a
two-line REPL.

## 6 — Peer-dep & bundle

### 6.1 Root `package.json` changes

```diff
  "peerDependencies": {
-   "brain.js": "^2.0.0-beta.0",
+   "@tensorflow/tfjs-core": "^4.22.0",
+   "@tensorflow/tfjs-layers": "^4.22.0",
    ...
  },
  "peerDependenciesMeta": {
-   "brain.js": { "optional": true },
+   "@tensorflow/tfjs-core":   { "optional": true },
+   "@tensorflow/tfjs-layers": { "optional": true },
    ...
  },
  "devDependencies": {
+   "@tensorflow/tfjs-core":        "^4.22.0",
+   "@tensorflow/tfjs-layers":      "^4.22.0",
+   "@tensorflow/tfjs-backend-cpu": "^4.22.0",
    ...
  }
```

Only `tfjs-core` and `tfjs-layers` are listed as peers. The backend package is
a consumer runtime choice — listing it as a peer would mis-scope consumers who
pick WASM or WebGL. `devDependencies` includes all three so `tsc`, `vitest`,
and the library build resolve everything locally and in CI.

### 6.2 Root `package.json` exports

```diff
- "./cognition/adapters/brainjs": { "import": ".../brainjs/index.js", "types": ".../brainjs/index.d.ts" },
+ "./cognition/adapters/tfjs":    { "import": ".../tfjs/index.js",    "types": ".../tfjs/index.d.ts"    },
```

### 6.3 Size budget (`size-limit` array)

Rename the brainjs entry to tfjs, keep 2 KB gzip — adapter is a thin wrapper
calling into external tfjs.

### 6.4 `vite.config.ts` (root)

```diff
  const externalPackages = [
-   'brain.js',
+   '@tensorflow/tfjs-core',
+   '@tensorflow/tfjs-layers',
    ...
  ];

  lib.entry = {
-   'cognition/adapters/brainjs/index': resolve(..., 'src/cognition/adapters/brainjs/index.ts'),
+   'cognition/adapters/tfjs/index':    resolve(..., 'src/cognition/adapters/tfjs/index.ts'),
    ...
  };
```

Remove the vitest alias (lines 164-178) that routed `brain.js` to the stub.

### 6.5 Demo `examples/nurture-pet/package.json`

```diff
  "devDependencies": {
-   "brain.js": "^2.0.0-beta.0",
+   "@tensorflow/tfjs-core": "^4.22.0",
+   "@tensorflow/tfjs-layers": "^4.22.0",
+   "@tensorflow/tfjs-backend-cpu": "^4.22.0",
    ...
  }
```

### 6.6 Bundle impact

- Library `dist/`: tfjs is external; overall size effectively unchanged. New
  adapter chunk (`dist/cognition/adapters/tfjs/index.js`) expected at 2–3 KB
  gzipped, parity with the old brainjs chunk.
- Demo `examples/nurture-pet/dist/`: brain.js's ~540 KB gzipped browser chunk
  is replaced by tfjs-core + tfjs-layers + tfjs-backend-cpu at ~350–450 KB
  gzipped. **Net small bundle decrease.**
- `npm audit` on the demo drops from **10 vulnerabilities (2 low, 8 high) to 0**.

## 7 — Test strategy

### 7.1 Unit — `tests/unit/cognition/adapters/TfjsReasoner.test.ts`

- Construct with a minimal `tf.Sequential`; assert `selectIntention` returns
  the expected `Intention` for a known features input under fixed weights.
- Two back-to-back `selectIntention` calls produce bit-identical output
  (deterministic inference).
- `train(pairs)` on a trivial linear mapping converges under a fixed seed —
  assert `finalLoss < threshold` and assert `history.loss` length equals
  `opts.epochs`.
- Same `pairs` + same `seed` → bit-identical final weights (training
  determinism under pre-shuffle + `shuffle: false`).
- `toJSON() → fromJSON()` round-trip produces a reasoner whose
  `selectIntention` output is bit-identical to the original.
- `dispose()` releases tracked tensors — assert `tf.memory().numTensors` does
  not grow after `construct + dispose + construct + dispose` ×N.
- Constructor with `backend: 'webgl'` when WebGL is not registered throws
  `TfjsBackendNotRegisteredError`.

### 7.2 Demo integration — updated `tests/examples/learningMode.train.test.ts`

- Replace stub imports with real tfjs + `@tensorflow/tfjs-backend-cpu`.
- Assert that clicking the Train button produces a `TfjsSnapshot` that
  localStorage-round-trips and rehydrates into a reasoner whose output differs
  from the pre-train baseline.
- Assert the switcher calls `dispose()` on the outgoing reasoner when the
  learning mode is swapped out (new behavior).

### 7.3 Existing test changes

- `tests/examples/cognitionSwitcher.test.ts`: update the probe assertion if
  the `learning` option's `peerName` string changes (it does:
  `'brain.js'` → `'@tensorflow/tfjs-core'`).
- Root `vite.config.ts` test alias section loses the `brain.js` entry. No
  other vitest config changes.

## 8 — File delta

### Added

- `src/cognition/adapters/tfjs/index.ts`
- `src/cognition/adapters/tfjs/TfjsReasoner.ts`
- `src/cognition/adapters/tfjs/TfjsSnapshot.ts`
- `tests/unit/cognition/adapters/TfjsReasoner.test.ts`
- `.changeset/cognition-adapter-tfjs.md`

### Modified

- `package.json`                                  (peers, devDeps, exports, size-limit)
- `package-lock.json`
- `vite.config.ts`                                (externalPackages, lib.entry, drop brain.js alias)
- `examples/nurture-pet/package.json`             (swap devDeps)
- `examples/nurture-pet/package-lock.json`
- `examples/nurture-pet/src/cognition/learning.ts`
- `examples/nurture-pet/src/cognition/learning.network.json`   (rewrite in `TfjsSnapshot` shape)
- `examples/nurture-pet/src/cognitionSwitcher.ts` (dispose on swap, localStorage key rename)
- `tests/examples/learningMode.train.test.ts`     (real tfjs, no stub)
- `tests/examples/cognitionSwitcher.test.ts`      (peerName string update)
- `README.md`                                     (mention tfjs-backed learning mode)
- `examples/nurture-pet/README.md`                (same)

### Deleted

- `src/cognition/adapters/brainjs/brain.d.ts`
- `src/cognition/adapters/brainjs/BrainJsReasoner.ts`
- `src/cognition/adapters/brainjs/index.ts`
- `tests/unit/cognition/adapters/BrainJsReasoner.test.ts`
- `tests/examples/stubs/brain-js.ts`

## 9 — Migration & rollout

1. Land the swap as a single PR to `develop` (one topic branch, one PR).
2. Changeset file documents the breaking change: removed
   `cognition/adapters/brainjs` subpath export, added `cognition/adapters/tfjs`
   subpath. Minor bump (project convention for pre-1.0 breaking changes, per
   the existing `cognition-adapter-brainjs.md` changeset's style).
3. Run `graphify update .` after merge to refresh the knowledge graph
   (`BrainJsReasoner` node → `TfjsReasoner` node in the "Cognition Adapters"
   community, 7-node cluster preserved).
4. Demo deployment (`demo` branch promotion) happens on the next scheduled
   demo push, per `PUBLISHING.md#demo-deployment`.

No pre-1.0 deprecation window. No `brain.js` stays in the tree.

## 10 — Risks & open verification points

Items to confirm during implementation (not blockers — noted so the
implementation plan can call them out as checkpoints):

1. **tfjs topology serialization shape.** `tf.Sequential.toJSON()` config
   shape varies across 3.x and 4.x. Pin `^4.22.0` and verify round-trip with
   a live model before finalizing `TfjsSnapshot.topology`'s type. If tfjs's
   native `tf.loadLayersModel` from a combined JSON proves cleaner than our
   hand-rolled split, fall back to its format and adjust `TfjsSnapshot`.
2. **`model.fit` internal randomness.** With `{ shuffle: false }` and
   pre-shuffled pairs, verify no other `Math.random` creeps into the training
   loop (dropout layers — we don't use them — would be the main source).
   Verify via a "train same pairs + same seed twice, compare weights
   bit-for-bit" test.
3. **`tf.memory()` assertions.** Exact `numTensors` counts can be flaky if
   tfjs keeps internal bookkeeping tensors. Assert against a baseline snapshot
   captured immediately post-construction rather than exact counts.
4. **Backend registration race.** If `construct()` runs twice in quick
   succession (rapid cognition-mode switching), concurrent `tf.setBackend`
   calls could race. Guard with a module-scoped `ready` promise, same pattern
   the existing `cognitionSwitcher` uses for probe state.
5. **localStorage quota.** Baseline snapshot is ~200 bytes. A trained 5→1
   model is similar. Well within quota — noted only so future hidden-layer
   upgrades know to check.

## 11 — Explicitly out of scope

- **Wiring the `Learner` interface** (`src/cognition/learning/Learner.ts` —
  score-driven adaptation). Tempting companion feature, but mixes two hard
  problems. Deferred to a follow-up spec.
- **Online learning inside the tick loop.** Violates the tick-loop determinism
  contract.
- **Auto-downgrade of backends.** If a consumer asks for `webgl` and it's not
  registered, we throw. Silent fallback hides configuration bugs.
- **Re-adding brain.js as a second backend.** Q1 picked clean replacement; no
  dual-adapter maintenance.
- **Training-data provenance scripts.** Q6 picked hand-authored baseline; no
  committed training-data CSV or offline pipeline.
