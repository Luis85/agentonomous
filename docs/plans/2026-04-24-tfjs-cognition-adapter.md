# TensorFlow.js Cognition Adapter — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the abandoned `brain.js` cognition adapter with a TensorFlow.js-backed `TfjsReasoner` that owns the full neural-network model lifecycle (construct + inference + train + persist + dispose).

**Architecture:** New library subpath export `agentonomous/cognition/adapters/tfjs` with one `Reasoner`-implementing class (`TfjsReasoner`), one snapshot codec (`TfjsSnapshot` + base64 helpers), and one typed error class (`TfjsBackendNotRegisteredError`). `@tensorflow/tfjs-core` + `@tensorflow/tfjs-layers` declared as optional peer deps; `dist/` stays tfjs-free (tfjs is marked external in the library build). The demo's Learning mode is rewritten against the new adapter; `brain.js` and its stub + alias + adapter source are deleted at the end of the plan.

**Tech Stack:** TypeScript (strict + `exactOptionalPropertyTypes`), `@tensorflow/tfjs-core@^4.22.0`, `@tensorflow/tfjs-layers@^4.22.0`, `@tensorflow/tfjs-backend-cpu@^4.22.0`, vitest (+ jsdom for switcher tests), Vite for library build + demo. ESM with `.js` extensions on relative imports.

**Design reference:** `docs/specs/2026-04-24-tfjs-cognition-adapter-design.md` — scope decisions there are out of scope to revisit.

---

## File Structure

### New files

- `src/cognition/adapters/tfjs/index.ts` — barrel re-exporting `TfjsReasoner`, `TfjsBackendNotRegisteredError`, `TfjsReasonerOptions`, `TfjsHelpers`, `TrainOptions`, `TrainResult`, `TfjsSnapshot`.
- `src/cognition/adapters/tfjs/TfjsReasoner.ts` — main class + options + helpers + training types + error class + module-local LCG/Fisher-Yates.
- `src/cognition/adapters/tfjs/TfjsSnapshot.ts` — `TfjsSnapshot` type + `encodeWeights` / `decodeWeights` helpers (`Float32Array[] ↔ base64` + shape manifest).
- `tests/unit/cognition/adapters/TfjsReasoner.test.ts` — TDD target for every adapter behaviour.
- `.changeset/cognition-adapter-tfjs.md` — release note for the swap.

### Modified files

- `package.json` — peer deps (swap `brain.js` for `@tensorflow/tfjs-core` + `-layers`), dev deps (add all three tfjs packages), exports map (swap brainjs subpath for tfjs), size-limit array.
- `package-lock.json` — from `npm install`.
- `vite.config.ts` — externalPackages (+ tfjs, − brain.js), lib.entry (+ tfjs adapter, − brainjs), delete brain.js vitest alias block.
- `examples/nurture-pet/package.json` — dev deps (swap brain.js for three tfjs packages).
- `examples/nurture-pet/package-lock.json` — from `npm install`.
- `examples/nurture-pet/src/cognition/learning.ts` — rewrite against `TfjsReasoner`.
- `examples/nurture-pet/src/cognition/learning.network.json` — rewrite in `TfjsSnapshot` shape with today's coefficients.
- `examples/nurture-pet/src/cognitionSwitcher.ts` — `trainRng`, new localStorage key, optional `dispose?.()` on outgoing reasoner.
- `tests/examples/learningMode.train.test.ts` — drop stub, use real tfjs.
- `tests/examples/cognitionSwitcher.test.ts` — update `peerName` assertion.
- `README.md` — mention tfjs-backed Learning mode in the "Running the example" / cognition blurb.
- `examples/nurture-pet/README.md` — same.

### Deleted files

- `src/cognition/adapters/brainjs/brain.d.ts`
- `src/cognition/adapters/brainjs/BrainJsReasoner.ts`
- `src/cognition/adapters/brainjs/index.ts`
- `tests/unit/cognition/adapters/BrainJsReasoner.test.ts`
- `tests/examples/stubs/brain-js.ts`

---

## Chunk 1: Setup — topic branch, tfjs deps, stage-clean gate

Produces a clean topic branch cut from `develop`, installs the three tfjs packages at both the root and demo, declares optional peers at the library level, and confirms the existing pre-PR gate (`npm run verify`) still passes with the new deps installed but no source changes yet. Both adapters (brainjs and soon-to-exist tfjs) coexist through Chunks 2–7; brainjs is deleted in Chunk 8.

### Task 1.0: Cut topic branch from `develop`

**Files:** none (git state only)

- [ ] **Step 1: Confirm clean `develop`**

```bash
git switch develop
git pull origin develop
git status
```

Expected: `On branch develop`, working tree clean, up-to-date with origin. If not clean, stash or commit on a different branch first — this plan assumes a clean start.

- [ ] **Step 2: Cut topic branch**

```bash
git switch -c feat/tfjs-cognition-adapter
```

Expected: `Switched to a new branch 'feat/tfjs-cognition-adapter'`.

---

### Task 1.1: Add tfjs to root devDeps and peerDeps

**Files:**

- Modify: `package.json`

The adapter imports `@tensorflow/tfjs-core` + `@tensorflow/tfjs-layers` for types; only `-core` and `-layers` are peers (the backend package is a consumer runtime choice). All three go into devDependencies so the library's own `tsc`, `vitest`, and `vite build` can resolve everything. Keep entries alphabetically ordered where the file already sorts that way.

- [ ] **Step 1: Edit `package.json` peerDependencies**

Remove `"brain.js": "^2.0.0-beta.0",` from the `peerDependencies` block. Add two entries alphabetically adjacent to existing `@anthropic-ai/sdk`:

```diff
   "peerDependencies": {
     "@anthropic-ai/sdk": "*",
-    "brain.js": "^2.0.0-beta.0",
+    "@tensorflow/tfjs-core": "^4.22.0",
+    "@tensorflow/tfjs-layers": "^4.22.0",
     "excalibur": "*",
     ...
   },
```

- [ ] **Step 2: Edit `package.json` peerDependenciesMeta**

```diff
   "peerDependenciesMeta": {
     "@anthropic-ai/sdk": { "optional": true },
-    "brain.js": { "optional": true },
+    "@tensorflow/tfjs-core":   { "optional": true },
+    "@tensorflow/tfjs-layers": { "optional": true },
     ...
   },
```

- [ ] **Step 3: Edit `package.json` devDependencies**

Add three entries alphabetically (they'll sit above `@types/node`):

```diff
   "devDependencies": {
     "@changesets/cli": "^2.31.0",
     "@eslint/js": "^10.0.1",
     "@size-limit/file": "^12.1.0",
+    "@tensorflow/tfjs-backend-cpu": "^4.22.0",
+    "@tensorflow/tfjs-core": "^4.22.0",
+    "@tensorflow/tfjs-layers": "^4.22.0",
     "@types/node": "^25.6.0",
     ...
   }
```

Do NOT remove `brain.js` from any list yet — it's still referenced by the adapter source until Chunk 8.

- [ ] **Step 4: Install**

```bash
npm install --no-audit --no-fund
```

Expected: packages install cleanly; `package-lock.json` updates. No gyp / node-gyp output — all three tfjs packages are pure JS, no native build.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add tensorflow/tfjs-core + layers + backend-cpu

Preparing to swap the cognition/adapters/brainjs subpath for a tfjs-
backed TfjsReasoner (see docs/specs/2026-04-24-tfjs-cognition-adapter-
design.md). brain.js / brain.d.ts / BrainJsReasoner still present in
this commit; they are removed in a later chunk of the same PR."
```

---

### Task 1.2: Add tfjs to demo devDeps

**Files:**

- Modify: `examples/nurture-pet/package.json`

The demo imports `@tensorflow/tfjs-core`, `@tensorflow/tfjs-layers`, and side-effect-imports `@tensorflow/tfjs-backend-cpu` to register the CPU backend. Keep `brain.js` in the demo's devDeps through Chunks 1–7 so the existing `learning.ts` keeps compiling; removed in Chunk 8.

- [ ] **Step 1: Edit demo `package.json`**

```diff
   "devDependencies": {
+    "@tensorflow/tfjs-backend-cpu": "^4.22.0",
+    "@tensorflow/tfjs-core": "^4.22.0",
+    "@tensorflow/tfjs-layers": "^4.22.0",
     "brain.js": "^2.0.0-beta.0",
     "js-son-agent": "^0.0.17",
     "mistreevous": "^4.3.1",
     "typescript": "^6.0.3",
     "vite": "^8.0.8"
   }
```

- [ ] **Step 2: Install demo deps**

```bash
cd examples/nurture-pet
npm install --no-audit --no-fund
cd ../..
```

Expected: installs cleanly. Lockfile updates.

- [ ] **Step 3: Commit**

```bash
git add examples/nurture-pet/package.json examples/nurture-pet/package-lock.json
git commit -m "chore(demo): add tfjs deps alongside brain.js (transitional)"
```

---

### Task 1.3: Verify baseline gate still passes

**Files:** none

Confirm the existing pre-PR gate is green with the new deps installed and no source changes. This is the baseline — if it's not green here, chase down the issue before writing any adapter code.

- [ ] **Step 1: Capture baseline test count**

```bash
npm test -- --reporter=verbose 2>&1 | tail -3
```

Expected: something like `Tests  N passed (N)`. Record `N` as the baseline — later chunks reference "baseline + X" instead of hardcoded totals (the `develop` tip moves between the day this plan is written and the day it runs).

- [ ] **Step 2: Run verify**

```bash
npm run verify
```

Expected: `format:check` → pass; `lint` → pass; `typecheck` → pass; `test` → baseline count from Step 1 pass; `build` → success. No new warnings from the added tfjs deps.

- [ ] **Step 3: If verify fails, STOP**

Do not proceed to Chunk 2 with a red baseline. Common failure modes at this step:

- `typecheck`: tfjs types conflict with something. Unlikely — tfjs-core ships its own types at `@tensorflow/tfjs-core/dist/index.d.ts`.
- `lint`: new deps imported somewhere unintentionally. Check `git status` for unexpected file changes.
- `test`: flaky; re-run once. If reproducibly failing, bisect vs `develop@HEAD`.

---

## Chunk 2: `TfjsSnapshot` codec (pure-JS unit)

Self-contained module that encodes/decodes the snapshot's weight payload (base64 of concatenated `Float32Array`s + shape manifest). No tfjs dependency in this file — it's pure-JS so it's trivially testable and reusable. Written first so Chunk 3+ can use it without mocking.

### Task 2.1: Write failing tests for the codec

**Files:**

- Create: `tests/unit/cognition/adapters/TfjsSnapshot.test.ts`

Test one file at a time; this one lives alongside the (not-yet-created) module.

- [ ] **Step 1: Create test file**

```ts
// tests/unit/cognition/adapters/TfjsSnapshot.test.ts
import { describe, expect, it } from 'vitest';
import {
  encodeWeights,
  decodeWeights,
  type TfjsSnapshot,
} from '../../../../src/cognition/adapters/tfjs/TfjsSnapshot.js';

describe('TfjsSnapshot codec', () => {
  it('round-trips a single Float32Array through base64', () => {
    const weights = [new Float32Array([-1, -0.8, -0.6, -0.7, -0.9, 0])];
    const shapes = [[6]];
    const encoded = encodeWeights(weights);
    const decoded = decodeWeights(encoded, shapes);
    expect(decoded).toHaveLength(1);
    expect(Array.from(decoded[0]!)).toEqual([-1, -0.8, -0.6, -0.7, -0.9, 0]);
  });

  it('round-trips multiple tensors split by shape', () => {
    const kernel = new Float32Array([1, 2, 3, 4, 5]);
    const bias = new Float32Array([0.5]);
    const encoded = encodeWeights([kernel, bias]);
    const decoded = decodeWeights(encoded, [[5, 1], [1]]);
    expect(Array.from(decoded[0]!)).toEqual([1, 2, 3, 4, 5]);
    expect(Array.from(decoded[1]!)).toEqual([0.5]);
  });

  it('preserves the NaN/Infinity float32 representation bit-for-bit', () => {
    const weights = [new Float32Array([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0])];
    const shapes = [[4]];
    const encoded = encodeWeights(weights);
    const decoded = decodeWeights(encoded, shapes);
    expect(Number.isNaN(decoded[0]![0]!)).toBe(true);
    expect(decoded[0]![1]).toBe(Number.POSITIVE_INFINITY);
    expect(decoded[0]![2]).toBe(Number.NEGATIVE_INFINITY);
    expect(decoded[0]![3]).toBe(0);
  });

  it('throws when decodeWeights receives shapes whose total size does not match the payload', () => {
    const encoded = encodeWeights([new Float32Array([1, 2, 3])]);
    expect(() => decodeWeights(encoded, [[5]])).toThrow(/shape/i);
  });

  it('TfjsSnapshot type version field is the literal 1', () => {
    const snapshot: TfjsSnapshot = {
      version: 1,
      topology: {},
      weights: '',
      weightsShapes: [],
    };
    expect(snapshot.version).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/unit/cognition/adapters/TfjsSnapshot.test.ts
```

Expected: all 5 tests fail with module-not-found (`Cannot find module '.../TfjsSnapshot.js'`). Good — we haven't created it yet.

---

### Task 2.2: Implement `TfjsSnapshot` + codec

**Files:**

- Create: `src/cognition/adapters/tfjs/TfjsSnapshot.ts`

- [ ] **Step 1: Write the module**

```ts
// src/cognition/adapters/tfjs/TfjsSnapshot.ts

/**
 * Versioned plain-JSON snapshot of a `TfjsReasoner`'s model — topology +
 * weights + shape manifest + optional column labels. The weight payload is
 * a base64 blob of concatenated `Float32Array`s; `weightsShapes` carries
 * one shape array per tensor so `decodeWeights` can re-slice them.
 *
 * Plain JSON so consumers can `JSON.stringify` it into localStorage without
 * touching tfjs's `tf.io.IOHandler` surface. `version: 1` is reserved for
 * future migration routing if the shape changes.
 *
 * @remarks
 * Encoded bytes preserve host-endian `Float32Array.buffer` layout. All
 * mainstream browsers and Node on every currently-shipping CPU run on
 * little-endian hardware, so round-trips work anywhere in practice; a
 * `TfjsSnapshot` authored on a big-endian machine would not decode
 * correctly on an LE consumer. Not a constraint we enforce; documented
 * here so future migration paths can add an explicit `endianness` field
 * if needed.
 */
export type TfjsSnapshot = {
  version: 1;
  topology: unknown;
  weights: string;
  weightsShapes: readonly (readonly number[])[];
  inputKeys?: readonly string[];
  outputKeys?: readonly string[];
};

/**
 * Concatenate the weight tensors into one base64-encoded `Float32Array`
 * byte payload. Callers round-trip it via `decodeWeights(payload, shapes)`
 * where `shapes` is the matching `weightsShapes` field.
 */
export function encodeWeights(weights: readonly Float32Array[]): string {
  let totalLength = 0;
  for (const w of weights) totalLength += w.length;
  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const w of weights) {
    combined.set(w, offset);
    offset += w.length;
  }
  const bytes = new Uint8Array(combined.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/**
 * Inverse of `encodeWeights`. `shapes` controls how the flat payload is
 * split: each entry's total element count is carved off the front of the
 * payload. Throws if the shape totals don't match the decoded length.
 */
export function decodeWeights(
  encoded: string,
  shapes: readonly (readonly number[])[],
): Float32Array[] {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const combined = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const result: Float32Array[] = [];
  let offset = 0;
  for (const shape of shapes) {
    const size = shape.reduce((acc, n) => acc * n, 1);
    if (offset + size > combined.length) {
      throw new Error(
        `TfjsSnapshot.decodeWeights: shape ${JSON.stringify(shape)} exceeds remaining payload ` +
          `(${combined.length - offset} floats left, ${size} needed)`,
      );
    }
    result.push(combined.slice(offset, offset + size));
    offset += size;
  }
  if (offset !== combined.length) {
    throw new Error(
      `TfjsSnapshot.decodeWeights: shapes total ${offset} floats but payload has ${combined.length}`,
    );
  }
  return result;
}
```

- [ ] **Step 2: Run the tests and confirm they pass**

```bash
npx vitest run tests/unit/cognition/adapters/TfjsSnapshot.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 3: Full `verify` gate still green**

```bash
npm run verify
```

Expected: `baseline + 5` tests pass (5 new `TfjsSnapshot` tests). Format/lint/typecheck/build all pass.

Note: if `prettier --check` fails on the new files, run `npx prettier --write src/cognition/adapters/tfjs/TfjsSnapshot.ts tests/unit/cognition/adapters/TfjsSnapshot.test.ts` and re-run verify.

- [ ] **Step 4: Commit**

```bash
git add src/cognition/adapters/tfjs/TfjsSnapshot.ts tests/unit/cognition/adapters/TfjsSnapshot.test.ts
git commit -m "feat(cognition/adapters/tfjs): add TfjsSnapshot + base64 weight codec

Pure-JS round-trip for Float32Array[] <-> base64 with a shape manifest.
Used by the TfjsReasoner's toJSON/fromJSON pair and by the demo's
bundled learning.network.json. No tfjs dependency at this layer —
tested directly via Float32Array inputs."
```

---

## Chunk 3: `TfjsReasoner` inference core

The smallest functional `Reasoner`: constructor stores the model + feature/interpret callbacks, `selectIntention` runs a forward pass, `getModel` escape hatch, `dispose` releases tensor memory, and `TfjsBackendNotRegisteredError` guards the sync constructor's backend assertion. Training and persistence come in Chunks 4 and 5.

### Task 3.1: Write failing tests for inference

**Files:**

- Create: `tests/unit/cognition/adapters/TfjsReasoner.test.ts`

- [ ] **Step 1: Create the test file**

```ts
// tests/unit/cognition/adapters/TfjsReasoner.test.ts
import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-layers';
import { layers, sequential } from '@tensorflow/tfjs-layers';
import { describe, expect, it, beforeAll } from 'vitest';
import {
  TfjsReasoner,
  TfjsBackendNotRegisteredError,
} from '../../../../src/cognition/adapters/tfjs/index.js';
import type { IntentionCandidate } from '../../../../src/cognition/IntentionCandidate.js';
import type { ReasonerContext } from '../../../../src/cognition/reasoning/Reasoner.js';
import { Modifiers } from '../../../../src/modifiers/Modifiers.js';

beforeAll(async () => {
  await tf.setBackend('cpu');
  await tf.ready();
});

function ctx(candidates: readonly IntentionCandidate[] = []): ReasonerContext {
  return {
    perceived: [],
    needs: undefined,
    modifiers: new Modifiers(),
    candidates,
  };
}

function makeLinearModel(): import('@tensorflow/tfjs-layers').Sequential {
  const model = sequential({
    layers: [
      layers.dense({
        units: 1,
        inputShape: [2],
        activation: 'linear',
        useBias: true,
        kernelInitializer: 'zeros',
        biasInitializer: 'zeros',
      }),
    ],
  });
  model.compile({ optimizer: tf.train.sgd(0.1), loss: 'meanSquaredError' });
  return model;
}

describe('TfjsReasoner — inference', () => {
  it('selectIntention returns null when interpret yields null', () => {
    const model = makeLinearModel();
    const reasoner = new TfjsReasoner({
      model,
      featuresOf: () => [0, 0],
      interpret: () => null,
    });
    expect(reasoner.selectIntention(ctx())).toBeNull();
    reasoner.dispose();
  });

  it('selectIntention returns the intention that interpret chooses', () => {
    const candidates: IntentionCandidate[] = [
      { intention: { id: 'eat', kind: 'skill', skillId: 'eat' }, score: 0.9, source: 'needs' },
      { intention: { id: 'rest', kind: 'skill', skillId: 'rest' }, score: 0.2, source: 'needs' },
    ];
    const model = makeLinearModel();
    const reasoner = new TfjsReasoner({
      model,
      featuresOf: () => [1, 0],
      interpret: (_out, _ctx, helpers) => helpers.topCandidate()?.intention ?? null,
    });
    const picked = reasoner.selectIntention(ctx(candidates));
    expect(picked).not.toBeNull();
    expect(picked?.id).toBe('eat');
    reasoner.dispose();
  });

  it('two back-to-back selectIntention calls produce identical output (deterministic inference)', () => {
    const model = makeLinearModel();
    // Set known weights so the forward pass is predictable.
    const [dense] = model.layers;
    dense!.setWeights([tf.tensor2d([[0.5], [0.25]]), tf.tensor1d([0.1])]);
    let lastOutput: number | null = null;
    const reasoner = new TfjsReasoner<number[], number[]>({
      model,
      featuresOf: () => [2, 4],
      interpret: (out) => {
        lastOutput = out[0] ?? null;
        return null;
      },
    });
    reasoner.selectIntention(ctx());
    const first = lastOutput;
    reasoner.selectIntention(ctx());
    const second = lastOutput;
    expect(first).not.toBeNull();
    expect(second).toBe(first); // bit-identical: 0.5*2 + 0.25*4 + 0.1 = 2.1
    expect(first).toBeCloseTo(2.1, 10);
    reasoner.dispose();
  });

  it('getModel returns the same Sequential instance', () => {
    const model = makeLinearModel();
    const reasoner = new TfjsReasoner({
      model,
      featuresOf: () => [0, 0],
      interpret: () => null,
    });
    expect(reasoner.getModel()).toBe(model);
    reasoner.dispose();
  });

  it('constructor throws TfjsBackendNotRegisteredError when requested backend differs', () => {
    const model = makeLinearModel();
    expect(
      () =>
        new TfjsReasoner({
          model,
          featuresOf: () => [0, 0],
          interpret: () => null,
          backend: 'webgl',
        }),
    ).toThrow(TfjsBackendNotRegisteredError);
    model.dispose();
  });

  it('dispose() returns tensor count close to baseline across repeated cycles', () => {
    const baselineBefore = tf.memory().numTensors;
    // Warm-up cycle so tfjs internal caches stabilise.
    {
      const model = makeLinearModel();
      const r = new TfjsReasoner({ model, featuresOf: () => [0, 0], interpret: () => null });
      r.selectIntention(ctx());
      r.dispose();
    }
    const baseline = tf.memory().numTensors;
    for (let i = 0; i < 10; i++) {
      const model = makeLinearModel();
      const r = new TfjsReasoner({ model, featuresOf: () => [0, 0], interpret: () => null });
      r.selectIntention(ctx());
      r.dispose();
    }
    const after = tf.memory().numTensors;
    // Allow a small slack for tfjs internal bookkeeping; exact-equality is flaky.
    expect(after - baseline).toBeLessThanOrEqual(5);
    expect(baseline).toBeGreaterThanOrEqual(baselineBefore);
  });

  it('TfjsBackendNotRegisteredError carries requestedBackend and suggestedPackage', () => {
    const err = new TfjsBackendNotRegisteredError('wasm');
    expect(err.requestedBackend).toBe('wasm');
    expect(err.suggestedPackage).toBe('@tensorflow/tfjs-backend-wasm');
    expect(err.message).toMatch(/tfjs-backend-wasm/);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/unit/cognition/adapters/TfjsReasoner.test.ts
```

Expected: all tests fail with module-not-found (`.../tfjs/index.js`). Good — we haven't created it yet.

---

### Task 3.2: Implement `TfjsBackendNotRegisteredError`

**Files:**

- Create: `src/cognition/adapters/tfjs/TfjsReasoner.ts` (start the file)

- [ ] **Step 1: Create the file with just the error class**

```ts
// src/cognition/adapters/tfjs/TfjsReasoner.ts
import * as tf from '@tensorflow/tfjs-core';
import type { Sequential } from '@tensorflow/tfjs-layers';
import type { Intention } from '../../Intention.js';
import type { IntentionCandidate } from '../../IntentionCandidate.js';
import type { Reasoner, ReasonerContext } from '../../reasoning/Reasoner.js';
import type { TfjsSnapshot } from './TfjsSnapshot.js';
// encodeWeights / decodeWeights are imported in Chunk 5 when toJSON /
// fromJSON actually use them — importing unused runtime symbols here
// would trip @typescript-eslint/no-unused-vars.

const BACKEND_PACKAGES: Record<'cpu' | 'wasm' | 'webgl', string> = {
  cpu: '@tensorflow/tfjs-backend-cpu',
  wasm: '@tensorflow/tfjs-backend-wasm',
  webgl: '@tensorflow/tfjs-backend-webgl',
};

/**
 * Thrown when a `TfjsReasoner` is constructed with `backend: 'X'` but
 * tfjs's current global backend is something else. Carries the suggested
 * npm package to install so UIs can render a useful message.
 */
export class TfjsBackendNotRegisteredError extends Error {
  readonly requestedBackend: 'cpu' | 'wasm' | 'webgl';
  readonly suggestedPackage: string;

  constructor(requestedBackend: 'cpu' | 'wasm' | 'webgl') {
    const suggestedPackage = BACKEND_PACKAGES[requestedBackend];
    super(
      `TfjsReasoner: requested backend "${requestedBackend}" is not the current tfjs backend ` +
        `("${tf.getBackend()}"). Install "${suggestedPackage}" and side-effect-import it ` +
        `before constructing the reasoner, or await tf.setBackend("${requestedBackend}") ` +
        `yourself.`,
    );
    this.name = 'TfjsBackendNotRegisteredError';
    this.requestedBackend = requestedBackend;
    this.suggestedPackage = suggestedPackage;
  }
}
```

- [ ] **Step 2: Create barrel**

```ts
// src/cognition/adapters/tfjs/index.ts
export {
  TfjsReasoner,
  TfjsBackendNotRegisteredError,
  type TfjsReasonerOptions,
  type TfjsHelpers,
  type TrainOptions,
  type TrainResult,
} from './TfjsReasoner.js';
export { type TfjsSnapshot } from './TfjsSnapshot.js';
```

(Typecheck will fail for now — `TfjsReasoner` etc. aren't defined. Good.)

- [ ] **Step 3: Confirm typecheck fails as expected**

```bash
npm run typecheck
```

Expected: error messages naming `TfjsReasoner`, `TfjsReasonerOptions`, etc. as undefined exports. Do NOT try to fix them here — the next task adds them.

---

### Task 3.3: Implement the inference-only `TfjsReasoner`

**Files:**

- Modify: `src/cognition/adapters/tfjs/TfjsReasoner.ts` (append to the file from Task 3.2)

Everything in this task is inference-only — no `train`, no `toJSON/fromJSON`, no `reset`. Those land in Chunks 4 and 5. The public method list here matches the spec's §3.2 minus the training / persistence rows.

- [ ] **Step 1: Append the types and class**

Append to `TfjsReasoner.ts`:

```ts
/**
 * Helpers passed to the consumer-provided `featuresOf` and `interpret`
 * callbacks. Same shape as the brainjs and js-son adapters' helpers so
 * demo code can swap adapters at call site.
 */
export type TfjsHelpers = {
  readonly candidates: readonly IntentionCandidate[];
  topCandidate: (filter?: (c: IntentionCandidate) => boolean) => IntentionCandidate | null;
  needsLevels: () => Record<string, number>;
};

/**
 * Constructor options. Generic parameters `In` / `Out` are unbounded —
 * whatever `featuresOf` produces (array, record, or tensor) the adapter
 * converts to a `tf.Tensor` via `tf.tensor(features)`; whatever the model
 * emits is extracted via `.arraySync()` / `.dataSync()` for `Out`.
 *
 * `backend` defaults to `'cpu'`. If the current tfjs backend doesn't
 * match, the constructor throws `TfjsBackendNotRegisteredError`; it does
 * NOT call `tf.setBackend()` itself because that's async. Use the async
 * `TfjsReasoner.fromJSON()` factory for backends that need registration.
 */
export interface TfjsReasonerOptions<In, Out> {
  model: Sequential;
  featuresOf: (ctx: ReasonerContext, helpers: TfjsHelpers) => In;
  interpret: (output: Out, ctx: ReasonerContext, helpers: TfjsHelpers) => Intention | null;
  backend?: 'cpu' | 'wasm' | 'webgl';
  seed?: number;
}

// TrainOptions / TrainResult declared here as opaque placeholders; their
// full shape and the train() implementation land in Chunk 4.
export type TrainOptions = {
  epochs?: number;
  batchSize?: number;
  learningRate?: number;
  shuffle?: boolean;
  seed?: number;
};
export type TrainResult = {
  finalLoss: number;
  history: { loss: readonly number[] };
};

/**
 * Reasoner adapter that delegates intention selection to a TensorFlow.js
 * `Sequential` model.
 *
 * Inference is always a forward pass (`model.predict`) over fixed weights
 * with no `Math.random`, no `Date.now()`, no `setTimeout`. Under the
 * default CPU backend the output is bit-identical across runs and
 * machines — this matches the tick-loop determinism contract in
 * `CLAUDE.md`.
 *
 * **`Reasoner.reset()` is intentionally NOT implemented.** The interface
 * contract (`src/cognition/reasoning/Reasoner.ts`) declares that trained
 * network weights "MUST be preserved" across resets, so a no-op or a
 * weight-revert would both be wrong. The kernel's `reset?.()` call
 * handles the absence. Consumers wanting to revert to the last snapshot
 * call `TfjsReasoner.fromJSON(...)` themselves.
 *
 * Training / persistence methods (`train`, `toJSON`, `fromJSON`) live in
 * later patches — this class is inference-only for now; the method stubs
 * are added in Chunks 4 and 5.
 */
export class TfjsReasoner<In = unknown, Out = unknown> implements Reasoner {
  private readonly model: Sequential;
  private readonly featuresOf: TfjsReasonerOptions<In, Out>['featuresOf'];
  private readonly interpret: TfjsReasonerOptions<In, Out>['interpret'];

  constructor(opts: TfjsReasonerOptions<In, Out>) {
    const requestedBackend = opts.backend ?? 'cpu';
    if (tf.getBackend() !== requestedBackend) {
      throw new TfjsBackendNotRegisteredError(requestedBackend);
    }
    this.model = opts.model;
    this.featuresOf = opts.featuresOf;
    this.interpret = opts.interpret;
  }

  selectIntention(ctx: ReasonerContext): Intention | null {
    const helpers: TfjsHelpers = {
      candidates: ctx.candidates,
      topCandidate: (filter) => {
        let best: IntentionCandidate | null = null;
        for (const c of ctx.candidates) {
          if (filter && !filter(c)) continue;
          if (!best || c.score > best.score) best = c;
        }
        return best;
      },
      needsLevels: () => {
        const needs = ctx.needs;
        if (!needs) return {};
        const out: Record<string, number> = {};
        for (const n of needs.list()) out[n.id] = n.level;
        return out;
      },
    };

    const features = this.featuresOf(ctx, helpers);
    const output = tf.tidy(() => {
      const inputTensor = features instanceof tf.Tensor ? features : tf.tensor([features as never]);
      const predictionTensor = this.model.predict(inputTensor) as tf.Tensor;
      const flat = predictionTensor.dataSync();
      return Array.from(flat) as unknown as Out;
    });
    return this.interpret(output, ctx, helpers);
  }

  getModel(): Sequential {
    return this.model;
  }

  dispose(): void {
    this.model.dispose();
  }

  // Stubs: full implementations in Chunks 4 and 5.
  train(_pairs: Array<{ features: In; label: Out }>, _opts?: TrainOptions): Promise<TrainResult> {
    return Promise.reject(new Error('TfjsReasoner.train not yet implemented (Chunk 4)'));
  }

  toJSON(): TfjsSnapshot {
    throw new Error('TfjsReasoner.toJSON not yet implemented (Chunk 5)');
  }

  static async fromJSON<In = unknown, Out = unknown>(
    _snapshot: TfjsSnapshot,
    _opts: Omit<TfjsReasonerOptions<In, Out>, 'model'>,
  ): Promise<TfjsReasoner<In, Out>> {
    throw new Error('TfjsReasoner.fromJSON not yet implemented (Chunk 5)');
  }
}
```

**Important caveat about `features instanceof tf.Tensor`**: this works for ergonomic array/record features by dispatching through `tf.tensor(...)` when the consumer returns a plain value. Consumers who build their own `tf.Tensor` in `featuresOf` pass through untouched.

- [ ] **Step 2: Run tests, confirm they pass**

```bash
npx vitest run tests/unit/cognition/adapters/TfjsReasoner.test.ts
```

Expected: 7 tests pass. The two train/persistence tests that throw `'not yet implemented'` are NOT part of this chunk's tests — only inference tests here. (The `dispose()` return-to-baseline test may show small tensor growth that fits within the `<= 5` slack.)

- [ ] **Step 3: Full `verify`**

```bash
npm run verify
```

Expected: all tests pass, format/lint/typecheck/build all green. Run prettier/eslint --fix if format:check flags the new files.

- [ ] **Step 4: Commit**

```bash
git add src/cognition/adapters/tfjs/TfjsReasoner.ts src/cognition/adapters/tfjs/index.ts tests/unit/cognition/adapters/TfjsReasoner.test.ts
git commit -m "feat(cognition/adapters/tfjs): TfjsReasoner inference core

Constructor + selectIntention + getModel + dispose + the backend-
mismatch error class. Training and persistence (train/toJSON/fromJSON)
are stubbed as rejecting promises / throwing errors until Chunks 4
and 5 fill them in."
```

---

## Chunk 4: `TfjsReasoner.train()` + deterministic shuffle

Fills in the `train` method: converts `{ features, label }[]` pairs to tensors, pre-shuffles with a seeded LCG + Fisher-Yates (so `tfjs`'s `Math.random`-based shuffle doesn't leak in), calls `model.fit` with `{ shuffle: false }`, and returns `TrainResult` with final loss + loss history.

### Task 4.1: Write failing tests for training

**Files:**

- Modify: `tests/unit/cognition/adapters/TfjsReasoner.test.ts`

- [ ] **Step 1: Append a training describe block**

Add at the end of the file:

```ts
describe('TfjsReasoner — training', () => {
  function makeConvergingPairs(): Array<{ features: number[]; label: number[] }> {
    // Simple pattern: output = (x0 + x1) / 2 — trivial linear converge target.
    return [
      { features: [0, 0], label: [0] },
      { features: [1, 1], label: [1] },
      { features: [0, 1], label: [0.5] },
      { features: [1, 0], label: [0.5] },
      { features: [0.2, 0.8], label: [0.5] },
      { features: [0.8, 0.2], label: [0.5] },
      { features: [0.3, 0.7], label: [0.5] },
      { features: [0.7, 0.3], label: [0.5] },
    ];
  }

  it('train(pairs) reduces loss on a trivially-learnable mapping', async () => {
    const model = makeLinearModel();
    const reasoner = new TfjsReasoner<number[], number[]>({
      model,
      featuresOf: () => [0, 0],
      interpret: () => null,
    });
    const result = await reasoner.train(makeConvergingPairs(), {
      epochs: 100,
      learningRate: 0.1,
      seed: 42,
    });
    expect(result.history.loss).toHaveLength(100);
    expect(result.finalLoss).toBeLessThan(0.05);
    reasoner.dispose();
  });

  it('same pairs + same seed → same final loss (deterministic training)', async () => {
    const pairs = makeConvergingPairs();
    const model1 = makeLinearModel();
    const r1 = new TfjsReasoner({ model: model1, featuresOf: () => [0, 0], interpret: () => null });
    const result1 = await r1.train(pairs, { epochs: 50, learningRate: 0.1, seed: 7 });

    const model2 = makeLinearModel();
    const r2 = new TfjsReasoner({ model: model2, featuresOf: () => [0, 0], interpret: () => null });
    const result2 = await r2.train(pairs, { epochs: 50, learningRate: 0.1, seed: 7 });

    // finalLoss should agree closely — if tfjs has hidden non-determinism,
    // weaken to `toBeCloseTo(result2.finalLoss, 3)` and document in the
    // adapter's JSDoc. (§10.2 in the spec.)
    expect(result1.finalLoss).toBeCloseTo(result2.finalLoss, 5);
    r1.dispose();
    r2.dispose();
  });

  it('train passes shuffle:false to model.fit (guarded via helper exposure)', async () => {
    // Indirect check: Fisher-Yates shuffle under fixed seed produces a
    // deterministic permutation. If we shuffle identical inputs twice, the
    // ordering and therefore the per-batch trajectories are identical.
    const pairs = makeConvergingPairs();
    const m1 = makeLinearModel();
    const r1 = new TfjsReasoner({ model: m1, featuresOf: () => [0, 0], interpret: () => null });
    const h1 = await r1.train(pairs, { epochs: 20, learningRate: 0.1, seed: 1 });
    const m2 = makeLinearModel();
    const r2 = new TfjsReasoner({ model: m2, featuresOf: () => [0, 0], interpret: () => null });
    const h2 = await r2.train(pairs, { epochs: 20, learningRate: 0.1, seed: 1 });
    expect(h1.history.loss).toEqual(h2.history.loss);
    r1.dispose();
    r2.dispose();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/unit/cognition/adapters/TfjsReasoner.test.ts -t training
```

Expected: all 3 new tests fail with the stub's rejected promise (`TfjsReasoner.train not yet implemented (Chunk 4)`).

---

### Task 4.2: Implement the seeded shuffle helpers

**Files:**

- Modify: `src/cognition/adapters/tfjs/TfjsReasoner.ts`

- [ ] **Step 1: Insert the LCG + Fisher-Yates helpers near the top**

Insert between the imports and `BACKEND_PACKAGES`:

```ts
/**
 * Minimal linear-congruential generator. Not cryptographic — just
 * repeatable under a fixed seed. Matches the LCG pattern used elsewhere
 * in the library's seeded test helpers.
 */
function makeLcg(seed: number): () => number {
  // Numerical Recipes constants; period 2^32.
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * In-place Fisher-Yates shuffle driven by a seeded RNG. Leaves the array
 * permuted but reuses the same element references.
 */
function seededShuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}
```

These helpers are NOT exported — they're private to the module.

---

### Task 4.3: Implement `train()`

**Files:**

- Modify: `src/cognition/adapters/tfjs/TfjsReasoner.ts`

- [ ] **Step 1: Replace the stub**

Replace the `train` method stub (`Promise.reject(...)`) with:

```ts
async train(
  pairs: Array<{ features: In; label: Out }>,
  opts: TrainOptions = {},
): Promise<TrainResult> {
  if (pairs.length === 0) {
    return { finalLoss: 0, history: { loss: [] } };
  }

  const epochs = opts.epochs ?? 50;
  const batchSize = opts.batchSize ?? Math.min(pairs.length, 32);
  const seed = opts.seed ?? 0;

  // Pre-shuffle so tfjs's own Math.random-based shuffle never runs.
  const shuffled = [...pairs];
  if (opts.shuffle ?? true) {
    seededShuffle(shuffled, makeLcg(seed));
  }

  const featuresTensor = tf.tensor(shuffled.map((p) => p.features) as never);
  const labelsTensor = tf.tensor(shuffled.map((p) => p.label) as never);

  try {
    const history = await this.model.fit(featuresTensor, labelsTensor, {
      epochs,
      batchSize,
      shuffle: false,
      verbose: 0,
    });
    const lossHistory = (history.history.loss as number[]).slice();
    return {
      finalLoss: lossHistory[lossHistory.length - 1] ?? 0,
      history: { loss: lossHistory },
    };
  } finally {
    featuresTensor.dispose();
    labelsTensor.dispose();
  }
}
```

**Notes:**

- `tf.tensor(array)` infers shape from the array. For `features: number[][]` this yields shape `[pairs, featuresLen]`; for labels `number[][]` it yields `[pairs, labelsLen]`. Consumers with more exotic `In`/`Out` types are responsible for matching the model's input/output shapes.
- `opts.learningRate` is intentionally ignored at this layer — changing the learning rate mid-model would require rebuilding the optimizer. The consumer compiles the model with their chosen optimizer/learning rate; if they want a different LR they rebuild and pass in a fresh model. A future enhancement could reset the optimizer here, but per YAGNI we don't support it until someone asks.
- Update the earlier stub comment to reflect reality — `learningRate` is a no-op in this version (leave a clarifying note in the `TrainOptions` JSDoc):

Replace the `learningRate?: number;` line in `TrainOptions` with:

```ts
  /**
   * Placeholder — the consumer-compiled model's optimizer owns the
   * learning rate. Ignored by the adapter; kept here so the option shape
   * is forward-compatible if/when we expose optimizer rebuild support.
   */
  learningRate?: number;
```

- [ ] **Step 2: Run training tests**

```bash
npx vitest run tests/unit/cognition/adapters/TfjsReasoner.test.ts -t training
```

Expected: all 3 tests pass. The spec's §4.3 authorises a single fallback path if tfjs shows hidden non-determinism — apply it uniformly to BOTH determinism tests in Task 4.1:

1. The "same pairs + same seed → same final loss" test weakens from `toBeCloseTo(result2.finalLoss, 5)` to `toBeCloseTo(..., 3)`.
2. The "train passes shuffle:false" test weakens from `expect(h1.history.loss).toEqual(h2.history.loss)` to a pairwise loop: `for (let i = 0; i < h1.history.loss.length; i++) expect(h1.history.loss[i]).toBeCloseTo(h2.history.loss[i]!, 3);`.

If EITHER test drifts beyond `toBeCloseTo(..., 5)`, weaken BOTH together (the underlying non-determinism source is the same — tfjs-internal — so they share a fallback). Document once on `train()`:

```ts
/**
 * ...
 * @remarks Determinism is best-effort. Verified stable to ~5 decimal
 * places on `@tensorflow/tfjs-layers@^4.22.0` CPU backend. If a future
 * tfjs version introduces non-determinism beyond that tolerance, this
 * note gets the drift source logged and the tests weaken to 3 decimals.
 */
```

- [ ] **Step 3: Full `verify`**

```bash
npm run verify
```

Expected: all tests pass, `size-limit` not yet enforced on the new chunk (that happens in Chunk 6), build passes.

- [ ] **Step 4: Commit**

```bash
git add src/cognition/adapters/tfjs/TfjsReasoner.ts tests/unit/cognition/adapters/TfjsReasoner.test.ts
git commit -m "feat(cognition/adapters/tfjs): train() + seeded Fisher-Yates pre-shuffle

Seeded LCG + in-place Fisher-Yates avoid tfjs's Math.random-based
built-in shuffle. model.fit runs with { shuffle: false } so the same
pairs + same seed produce bit-identical (or within documented
tolerance) training trajectories. learningRate option is accepted but
ignored — the consumer-compiled model's optimizer owns the actual LR."
```

---

## Chunk 5: `TfjsReasoner.toJSON()` + `fromJSON()`

Adds round-trip persistence. `toJSON` extracts topology + flattened weights + shapes; `fromJSON` is the async factory that registers the requested backend (via `tf.setBackend`) if needed, rebuilds the `Sequential` from the topology, re-applies the weights, and returns a ready-to-use reasoner.

### Task 5.1: Write failing tests for persistence

**Files:**

- Modify: `tests/unit/cognition/adapters/TfjsReasoner.test.ts`

- [ ] **Step 1: Append a persistence describe block**

Add at the end of the file:

```ts
describe('TfjsReasoner — persistence', () => {
  it('toJSON → fromJSON round-trip produces byte-identical selectIntention output', async () => {
    const model1 = makeLinearModel();
    const [dense1] = model1.layers;
    dense1!.setWeights([tf.tensor2d([[0.3], [-0.4]]), tf.tensor1d([0.05])]);

    const captureOut = (bag: { v: number | null }) => (out: number[]) => {
      bag.v = out[0] ?? null;
      return null;
    };
    const bag1 = { v: null as number | null };
    const r1 = new TfjsReasoner<number[], number[]>({
      model: model1,
      featuresOf: () => [0.7, 0.9],
      interpret: captureOut(bag1),
    });
    r1.selectIntention(ctx());
    const snapshot = r1.toJSON();
    expect(snapshot.version).toBe(1);
    expect(typeof snapshot.weights).toBe('string');
    expect(snapshot.weightsShapes.length).toBeGreaterThan(0);

    const bag2 = { v: null as number | null };
    const r2 = await TfjsReasoner.fromJSON<number[], number[]>(snapshot, {
      featuresOf: () => [0.7, 0.9],
      interpret: captureOut(bag2),
    });
    r2.selectIntention(ctx());

    expect(bag2.v).toBe(bag1.v);
    r1.dispose();
    r2.dispose();
  });

  it('fromJSON rejects a corrupted snapshot with a clear error', async () => {
    const bogus = {
      version: 1 as const,
      topology: { garbage: true },
      weights: '',
      weightsShapes: [[5, 1], [1]],
    };
    await expect(
      TfjsReasoner.fromJSON(bogus, {
        featuresOf: () => [0],
        interpret: () => null,
      }),
    ).rejects.toThrow();
  });

  it('fromJSON is tolerant of the currently-active backend (no throw for cpu)', async () => {
    const model = makeLinearModel();
    const r = new TfjsReasoner({
      model,
      featuresOf: () => [0, 0],
      interpret: () => null,
    });
    const snapshot = r.toJSON();
    r.dispose();

    // Default backend option is cpu, which is already registered by
    // @tensorflow/tfjs-backend-cpu in beforeAll.
    const r2 = await TfjsReasoner.fromJSON(snapshot, {
      featuresOf: () => [0, 0],
      interpret: () => null,
    });
    expect(r2.getModel()).toBeDefined();
    r2.dispose();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/unit/cognition/adapters/TfjsReasoner.test.ts -t persistence
```

Expected: all 3 new tests fail — `toJSON` throws `'not yet implemented (Chunk 5)'`; `fromJSON` throws the same.

---

### Task 5.2: Implement `toJSON()`

**Files:**

- Modify: `src/cognition/adapters/tfjs/TfjsReasoner.ts`

- [ ] **Step 1: Replace the `toJSON` stub**

Replace the `toJSON()` stub with:

```ts
toJSON(): TfjsSnapshot {
  const weightTensors = this.model.getWeights();
  const weightsShapes = weightTensors.map((t) => [...t.shape]);
  const weightsArrays = weightTensors.map((t) => t.dataSync() as Float32Array);
  // tf.Sequential.toJSON() returns a string; parse it so the field is a
  // plain JS value (shape: tfjs-layers ModelConfig).
  const topologyString =
    typeof this.model.toJSON === 'function'
      ? (this.model.toJSON(null, false) as unknown)
      : (() => {
          throw new Error('tf.Sequential.toJSON unavailable');
        })();
  return {
    version: 1,
    topology: topologyString,
    weights: encodeWeights(weightsArrays),
    weightsShapes,
  };
}
```

**Caveats:**

- `tf.Sequential.toJSON()` signature: `toJSON(_unused?, returnString = true): string | object`. Passing `false` returns an object. API subject to change across tfjs versions — if typecheck flags `toJSON(null, false)`, switch to `(this.model.toJSON as any)(null, false)` and add a TODO referencing the tfjs-layers type gap.
- Empty `dataSync()` of a disposed tensor throws. `model.getWeights()` returns fresh tensor handles each call, so this is safe within a single `toJSON` invocation.

- [ ] **Step 2: Run the first round-trip test only (to validate toJSON output shape)**

```bash
npx vitest run tests/unit/cognition/adapters/TfjsReasoner.test.ts -t "toJSON → fromJSON round-trip"
```

Expected: test fails in its `TfjsReasoner.fromJSON(...)` call (not yet implemented). The first half of the test — `snapshot.version === 1`, `typeof snapshot.weights === 'string'`, `weightsShapes.length > 0` — should pass up to the fromJSON call.

---

### Task 5.3: Implement `static fromJSON()`

**Files:**

- Modify: `src/cognition/adapters/tfjs/TfjsReasoner.ts`

Imports needed: the dynamic `tf.models.modelFromJSON` from `@tensorflow/tfjs-layers` to rebuild a `Sequential` from topology.

- [ ] **Step 1: Add an import and replace the stub**

At the top of the file, expand the tfjs-layers import:

```ts
import { models } from '@tensorflow/tfjs-layers';
import type { Sequential } from '@tensorflow/tfjs-layers';
```

Replace the `fromJSON` stub with:

```ts
static async fromJSON<In = unknown, Out = unknown>(
  snapshot: TfjsSnapshot,
  opts: Omit<TfjsReasonerOptions<In, Out>, 'model'>,
): Promise<TfjsReasoner<In, Out>> {
  if (snapshot.version !== 1) {
    throw new Error(`TfjsReasoner.fromJSON: unsupported snapshot version ${snapshot.version as number}`);
  }

  const requestedBackend = opts.backend ?? 'cpu';
  if (tf.getBackend() !== requestedBackend) {
    try {
      const ok = await tf.setBackend(requestedBackend);
      if (!ok) throw new TfjsBackendNotRegisteredError(requestedBackend);
    } catch (err) {
      if (err instanceof TfjsBackendNotRegisteredError) throw err;
      throw new TfjsBackendNotRegisteredError(requestedBackend);
    }
    await tf.ready();
  }

  // Rebuild the Sequential from the stored topology.
  const rebuilt = (await models.modelFromJSON(
    snapshot.topology as never,
  )) as unknown as Sequential;

  // Re-apply weights in the original order.
  const weightArrays = decodeWeights(snapshot.weights, snapshot.weightsShapes);
  const tensors = weightArrays.map((arr, i) =>
    tf.tensor(Array.from(arr), snapshot.weightsShapes[i] as number[]),
  );
  rebuilt.setWeights(tensors);
  for (const t of tensors) t.dispose();

  return new TfjsReasoner<In, Out>({ ...opts, model: rebuilt });
}
```

**Notes:**

- `tf.setBackend` returns `Promise<boolean>` — `false` if the backend isn't registered. We normalize both that and thrown errors to `TfjsBackendNotRegisteredError`.
- `models.modelFromJSON` accepts either the parsed topology object or an object with a `modelTopology` field. Shape confirmed by the first `toJSON → fromJSON` round-trip test in Task 5.4.
- The temporary `void encodeWeights; void decodeWeights;` from Task 3.3 can now be deleted — both are live.

- [ ] **Step 2: Add the codec imports**

Near the top of `TfjsReasoner.ts`, expand the `TfjsSnapshot` import:

```diff
-import type { TfjsSnapshot } from './TfjsSnapshot.js';
-// encodeWeights / decodeWeights are imported in Chunk 5 when toJSON /
-// fromJSON actually use them — importing unused runtime symbols here
-// would trip @typescript-eslint/no-unused-vars.
+import {
+  type TfjsSnapshot,
+  encodeWeights,
+  decodeWeights,
+} from './TfjsSnapshot.js';
```

- [ ] **Step 3: Run all persistence tests**

```bash
npx vitest run tests/unit/cognition/adapters/TfjsReasoner.test.ts -t persistence
```

Expected: all 3 tests pass. If `models.modelFromJSON` rejects the topology shape, inspect the object form `tf.Sequential.toJSON(null, false)` produces and adjust: either wrap in `{ modelTopology: topology }` or pass through a second JSON.stringify round-trip. Document the empirical choice in a comment on `toJSON`.

- [ ] **Step 4: Full `verify`**

```bash
npm run verify
```

Expected: every test passes, format/lint/typecheck/build all green.

- [ ] **Step 5: Commit**

```bash
git add src/cognition/adapters/tfjs/TfjsReasoner.ts tests/unit/cognition/adapters/TfjsReasoner.test.ts
git commit -m "feat(cognition/adapters/tfjs): toJSON + async fromJSON round-trip

toJSON snapshots topology + flattened Float32Array weights + shape
manifest via the base64 codec. fromJSON awaits tf.setBackend when the
requested backend differs from the current global (mapping failures
to TfjsBackendNotRegisteredError), rebuilds the Sequential via
tf.models.modelFromJSON, and re-applies weights. Unused-import
suppressions dropped."
```

---

## Chunk 6: Library wiring — exports, externals, size-limit

Makes the new adapter importable via the `agentonomous/cognition/adapters/tfjs` subpath and enforces its bundle budget. brainjs stays alive in this chunk — both adapters build side by side.

### Task 6.1: Mark tfjs externals and add the new lib entry

**Files:**

- Modify: `vite.config.ts`

- [ ] **Step 1: Edit `externalPackages`**

```diff
 const externalPackages = [
   '@anthropic-ai/sdk',
+  '@tensorflow/tfjs-core',
+  '@tensorflow/tfjs-layers',
   'brain.js',
   'excalibur',
   'js-son-agent',
   ...
 ];
```

- [ ] **Step 2: Add the new lib entry**

In the `lib.entry` object, add:

```diff
   entry: {
     index: resolve(__dirname, 'src/index.ts'),
     'integrations/excalibur/index': resolve(__dirname, 'src/integrations/excalibur/index.ts'),
     'cognition/adapters/mistreevous/index': resolve(
       __dirname,
       'src/cognition/adapters/mistreevous/index.ts',
     ),
     'cognition/adapters/js-son/index': resolve(__dirname, 'src/cognition/adapters/js-son/index.ts'),
     'cognition/adapters/brainjs/index': resolve(__dirname, 'src/cognition/adapters/brainjs/index.ts'),
+    'cognition/adapters/tfjs/index': resolve(__dirname, 'src/cognition/adapters/tfjs/index.ts'),
   },
```

Keep the brainjs entry for now; it's deleted in Chunk 8.

- [ ] **Step 3: Run build to verify the chunk emits**

```bash
npm run build
```

Expected: `dist/cognition/adapters/tfjs/index.js` appears in the build output listing. `tfjs-core` and `tfjs-layers` imports stay as bare specifiers in the output (external, not bundled).

- [ ] **Step 4: Inspect the emitted chunk (optional sanity check)**

```bash
head -20 dist/cognition/adapters/tfjs/index.js
```

Expected: starts with `import { ... } from "@tensorflow/tfjs-core";` / `from "@tensorflow/tfjs-layers";`. No `gpu.js`, no bundled tfjs internals.

---

### Task 6.1b: Add the vitest subpath alias

**Files:**

- Modify: `vite.config.ts`

`vite.config.ts`'s vitest alias block currently maps `agentonomous/cognition/adapters/{mistreevous,js-son,brainjs}` specifiers to their `src/` paths (so tests importing those subpaths don't depend on a built `dist/`). We need the same for tfjs. The brainjs alias stays in place through Chunks 1–7; Chunk 8 removes it.

- [ ] **Step 1: Add the alias entry**

In the `test.alias` array (right after the existing brainjs entry), add:

```diff
       {
         find: /^agentonomous\/cognition\/adapters\/brainjs$/,
         replacement: resolve(__dirname, 'src/cognition/adapters/brainjs/index.ts'),
       },
+      {
+        find: /^agentonomous\/cognition\/adapters\/tfjs$/,
+        replacement: resolve(__dirname, 'src/cognition/adapters/tfjs/index.ts'),
+      },
       {
         find: /^agentonomous$/,
         replacement: resolve(__dirname, 'src/index.ts'),
       },
```

- [ ] **Step 2: Quick sanity check**

```bash
npx vitest run tests/unit/cognition/adapters/TfjsReasoner.test.ts
```

Expected: tests still pass (the alias doesn't change behaviour for tests that already imported via relative paths; it just lets the demo + future tests use the subpath specifier).

---

### Task 6.2: Add the subpath export + size-limit budget

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add subpath export**

In the `exports` block, add alongside the other cognition adapters:

```diff
   "./cognition/adapters/brainjs": {
     "import": "./dist/cognition/adapters/brainjs/index.js",
     "types": "./dist/cognition/adapters/brainjs/index.d.ts"
   },
+  "./cognition/adapters/tfjs": {
+    "import": "./dist/cognition/adapters/tfjs/index.js",
+    "types": "./dist/cognition/adapters/tfjs/index.d.ts"
+  },
   "./package.json": "./package.json"
```

- [ ] **Step 2: Add size-limit entry**

In the `size-limit` array, add alongside the other adapter budgets:

```diff
   {
     "name": "dist/cognition/adapters/brainjs/index.js (gzip)",
     "path": "dist/cognition/adapters/brainjs/index.js",
     "gzip": true,
     "limit": "2 KB"
+  },
+  {
+    "name": "dist/cognition/adapters/tfjs/index.js (gzip)",
+    "path": "dist/cognition/adapters/tfjs/index.js",
+    "gzip": true,
+    "limit": "3 KB"
   }
```

- [ ] **Step 3: Run size-limit**

```bash
npm run size
```

Expected: all entries within budget, including the new 3 KB tfjs row. If it exceeds 3 KB, the likely culprit is overly-inlined tfjs types pulled into runtime — confirm with `npm run size:why` and trim if needed.

- [ ] **Step 4: Full `verify`**

```bash
npm run verify
```

Expected: everything green.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts package.json package-lock.json
git commit -m "build(cognition/adapters/tfjs): wire subpath export + size budget

External packages list picks up @tensorflow/tfjs-{core,layers}; lib
entry emits dist/cognition/adapters/tfjs/index.js alongside the other
adapters; package.json exports the subpath; size-limit enforces a
3 KB gzip budget."
```

---

## Chunk 7: Demo migration — learning.ts, baseline JSON, switcher

Swaps the demo's Learning mode from `BrainJsReasoner` to `TfjsReasoner`. Adds the hand-authored baseline network JSON in the new snapshot format. Rewrites the Train-button handler to use a demo-local `trainRng`. The switcher now disposes the outgoing reasoner. brainjs adapter source remains present; that deletion happens in Chunk 8.

### Task 7.1: Author the new baseline `learning.network.json`

**Files:**

- Modify: `examples/nurture-pet/src/cognition/learning.network.json`

The baseline encodes: `Dense(1, activation='sigmoid', inputShape=[5])` with kernel `[-1, -0.8, -0.6, -0.7, -0.9]` column-vector and bias `[0]`. TypedArray layout: `Float32Array([-1, -0.8, -0.6, -0.7, -0.9, 0])` — kernel first (5 floats for a [5,1] tensor), bias last (1 float).

- [ ] **Step 1: Generate the base64 weights**

Run a throwaway node REPL to get the base64:

```bash
node -e "const buf = Buffer.from(new Float32Array([-1, -0.8, -0.6, -0.7, -0.9, 0]).buffer); console.log(buf.toString('base64'));"
```

Expected output (copy this literal; your actual byte order may differ — trust the node output):

```
AACAvzMzTL+amRm/MzMzv2Zm5r4AAAAA
```

Save this string — you'll paste it into the JSON below.

- [ ] **Step 2: Capture the topology**

The topology is a `tf.Sequential` config for a single `Dense(1, activation='sigmoid', inputShape=[5], useBias=true)` layer. Generate the canonical shape by running a separate REPL (or use this hand-crafted minimal config, which matches what `tf.Sequential.toJSON(null, false)` emits on tfjs-layers 4.22 — verify in implementation):

Write the JSON literal into `examples/nurture-pet/src/cognition/learning.network.json`, replacing the file entirely:

```json
{
  "version": 1,
  "topology": {
    "class_name": "Sequential",
    "config": {
      "name": "sequential_1",
      "layers": [
        {
          "class_name": "Dense",
          "config": {
            "name": "dense_Dense1",
            "trainable": true,
            "batch_input_shape": [null, 5],
            "dtype": "float32",
            "units": 1,
            "activation": "sigmoid",
            "use_bias": true,
            "kernel_initializer": { "class_name": "VarianceScaling", "config": {} },
            "bias_initializer": { "class_name": "Zeros", "config": {} }
          }
        }
      ]
    },
    "keras_version": "tfjs-layers 4.22.0",
    "backend": "tensor_flow.js"
  },
  "weights": "AACAvzMzTL+amRm/MzMzv2Zm5r4AAAAA",
  "weightsShapes": [
    [5, 1],
    [1]
  ],
  "inputKeys": ["hunger", "cleanliness", "happiness", "energy", "health"],
  "outputKeys": ["score"]
}
```

- [ ] **Step 3: Verify the topology literal matches what tfjs-layers actually emits**

The exact `topology` shape above may differ from what tfjs-layers 4.22 serializes (keras_version string, field ordering, optional fields). Confirm by running a one-shot verification script.

Save this as `scripts/verify-topology.mjs` (throwaway — deleted in Step 5 below):

```js
// scripts/verify-topology.mjs
import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs-core';
import { layers, sequential } from '@tensorflow/tfjs-layers';
await tf.ready();
const m = sequential({
  layers: [
    layers.dense({
      units: 1,
      inputShape: [5],
      activation: 'sigmoid',
      useBias: true,
    }),
  ],
});
const [dense] = m.layers;
dense.setWeights([
  tf.tensor2d([[-1], [-0.8], [-0.6], [-0.7], [-0.9]]),
  tf.tensor1d([0]),
]);
const topology = m.toJSON(null, false);
console.log(JSON.stringify(topology, null, 2));
```

Run it:

```bash
node scripts/verify-topology.mjs
```

- [ ] **Step 4: If the output differs from the literal, update `learning.network.json`**

Diff the printed output against the `topology` field in `learning.network.json`. If they match exactly — great, move on. If they don't, copy the ACTUAL output into the `topology` field, keeping `version`, `weights`, `weightsShapes`, `inputKeys`, `outputKeys` unchanged.

- [ ] **Step 5: Delete the throwaway script**

```bash
rm scripts/verify-topology.mjs
# rmdir scripts if the directory is empty and didn't previously exist
```

---

### Task 7.2: Write the baseline round-trip test

**Files:**

- Modify: `tests/unit/cognition/adapters/TfjsReasoner.test.ts`

- [ ] **Step 1: Append the baseline round-trip test**

At the end of the file:

```ts
describe('TfjsReasoner — bundled demo baseline', () => {
  it('learning.network.json loads and produces sigmoid(-1) ≈ 0.2689 for hunger=1', async () => {
    // Import the JSON via a relative file read so this test doesn't depend
    // on TypeScript's module resolution of an examples-side path.
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const baselinePath = path.resolve(
      process.cwd(),
      'examples/nurture-pet/src/cognition/learning.network.json',
    );
    const snapshot = JSON.parse(await readFile(baselinePath, 'utf8')) as Parameters<
      typeof TfjsReasoner.fromJSON
    >[0];

    const featureVec = [1, 0, 0, 0, 0];
    let captured: number | null = null;
    const reasoner = await TfjsReasoner.fromJSON<number[], number[]>(snapshot, {
      featuresOf: () => featureVec,
      interpret: (out) => {
        captured = out[0] ?? null;
        return null;
      },
    });
    reasoner.selectIntention(ctx());

    // sigmoid(-1 * 1 + 0) = 1 / (1 + e^1) ≈ 0.2689
    expect(captured).not.toBeNull();
    expect(captured!).toBeCloseTo(0.2689, 4);
    reasoner.dispose();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run tests/unit/cognition/adapters/TfjsReasoner.test.ts -t "bundled demo baseline"
```

Expected: test passes with the output within 4 decimals of `0.2689`. If it fails:

- If the error is `tf.models.modelFromJSON` rejecting the topology: the literal topology in Task 7.1 doesn't match what tfjs expects. Regenerate via the one-shot REPL.
- If the sigmoid value is off: the weights' byte order is wrong. Regenerate the base64 via the node command in Task 7.1 step 1.

Both failure modes are from hand-authoring; fix in `learning.network.json` and re-run.

- [ ] **Step 3: Commit**

```bash
git add examples/nurture-pet/src/cognition/learning.network.json tests/unit/cognition/adapters/TfjsReasoner.test.ts
git commit -m "feat(demo): rewrite learning.network.json in TfjsSnapshot format

Same coefficients as the previous brain.js baseline (kernel
[-1, -0.8, -0.6, -0.7, -0.9], bias 0); serialized as a tfjs-layers
Sequential topology + base64-encoded Float32Array weights with a
shape manifest. Unit-tested via a sigmoid round-trip to guard
against fat-fingered edits."
```

---

### Task 7.3: Rewrite `learning.ts` against `TfjsReasoner`

**Files:**

- Modify: `examples/nurture-pet/src/cognition/learning.ts`

- [ ] **Step 1: Replace the file**

```ts
import type { Reasoner, ReasonerContext } from 'agentonomous';
import type { CognitionModeSpec } from './index.js';
import networkJson from './learning.network.json';

/**
 * Urgency floor for the learning-mode `interpret()` gate. The network's
 * scalar output is a [0, 1] urgency estimate — values below this floor
 * cause the pet to idle this tick rather than commit an intention.
 *
 * Picked empirically so the default hand-authored weights produce a
 * visible idle rate and re-training shifts the observable behavior.
 * Tune up (toward 0.5) if the post-train idle rate is indistinguishable
 * from the baseline; tune down (toward 0.2) if the pet rarely acts.
 */
const URGENCY_THRESHOLD = 0.35;

let agentIdForHydration: string | null = null;

export function setLearningAgentId(id: string | null): void {
  agentIdForHydration = id;
}

function storageKey(agentId: string): string {
  return `agentonomous/${agentId}/tfjs-network`;
}

function loadPersistedSnapshot(agentId: string | null): unknown {
  if (agentId === null) return null;
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(agentId));
    if (typeof raw !== 'string' || raw.length === 0) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Learning mode. On `construct()`, hydrates the TfjsReasoner from the
 * browser-local persisted snapshot if present, falling back to the
 * bundled `learning.network.json` baseline. The Train button in the
 * switcher calls `reasoner.train(...)` and persists `reasoner.toJSON()`.
 *
 * `interpret()` feeds the network's scalar output through an urgency
 * gate: the pet idles this tick when the output drops below
 * `URGENCY_THRESHOLD`; otherwise it commits the top heuristic
 * candidate. Trained and untrained networks thus produce different
 * idle rates, making training observable in the trace view.
 *
 * `construct()` side-effect-imports `@tensorflow/tfjs-backend-cpu` so
 * the backend is registered lazily — only when the user actually
 * switches to this mode.
 */
export const learningMode: CognitionModeSpec = {
  id: 'learning',
  label: 'Learning (tfjs)',
  peerName: '@tensorflow/tfjs-core',
  async probe(): Promise<boolean> {
    try {
      await import('@tensorflow/tfjs-core');
      await import('@tensorflow/tfjs-layers');
      return true;
    } catch {
      return false;
    }
  },
  async construct(): Promise<Reasoner> {
    await import('@tensorflow/tfjs-backend-cpu');
    const { TfjsReasoner } = await import('agentonomous/cognition/adapters/tfjs');

    const persisted = loadPersistedSnapshot(agentIdForHydration);
    const seed = (persisted ?? networkJson) as Parameters<typeof TfjsReasoner.fromJSON>[0];

    try {
      return await TfjsReasoner.fromJSON<number[], number[]>(seed, {
        featuresOf: (_ctx: ReasonerContext, helpers) => {
          const levels = helpers.needsLevels();
          return [
            levels.hunger ?? 0,
            levels.cleanliness ?? 0,
            levels.happiness ?? 0,
            levels.energy ?? 0,
            levels.health ?? 0,
          ];
        },
        interpret: (output, _ctx, helpers) => {
          const urgency = output[0] ?? 0;
          if (urgency < URGENCY_THRESHOLD) return null;
          const top = helpers.topCandidate();
          return top ? top.intention : null;
        },
      });
    } catch {
      // Corrupt stored snapshot — fall back to bundled baseline.
      return TfjsReasoner.fromJSON<number[], number[]>(networkJson as never, {
        featuresOf: (_ctx, helpers) => {
          const levels = helpers.needsLevels();
          return [
            levels.hunger ?? 0,
            levels.cleanliness ?? 0,
            levels.happiness ?? 0,
            levels.energy ?? 0,
            levels.health ?? 0,
          ];
        },
        interpret: (output, _ctx, helpers) => {
          const urgency = output[0] ?? 0;
          if (urgency < URGENCY_THRESHOLD) return null;
          const top = helpers.topCandidate();
          return top ? top.intention : null;
        },
      });
    }
  },
};
```

Note: the two `featuresOf` / `interpret` block is slightly DRY-violating but keeps the primary + fallback paths each self-contained. Refactoring to share a factory is optional polish — skip unless it's needed for clarity.

- [ ] **Step 2: Compile the demo**

```bash
cd examples/nurture-pet
npx tsc --noEmit
cd ../..
```

Expected: no TypeScript errors. If the `Parameters<typeof TfjsReasoner.fromJSON>[0]` inference doesn't work, inline the snapshot type:

```ts
import type { TfjsSnapshot } from 'agentonomous/cognition/adapters/tfjs';
const seed = (persisted ?? networkJson) as TfjsSnapshot;
```

---

### Task 7.4: Wire dispose + trainRng + new key into `cognitionSwitcher.ts`

**Files:**

- Modify: `examples/nurture-pet/src/cognitionSwitcher.ts`

- [ ] **Step 1: Read the current file first**

Open `examples/nurture-pet/src/cognitionSwitcher.ts` in the editor (or use the `Read` tool). Scan for: (a) module-local state near the top, (b) the existing Train-button handler, (c) the `onChange(newMode)` mode-swap hook. The edits below assume the file exists and has these three sections; adjust imports/locations to match what's actually there.

- [ ] **Step 2: Add a module-local `trainRng`**

At the top of `cognitionSwitcher.ts`, near the other module-local state:

```ts
/**
 * Seeded RNG for the demo's Train button. Deliberately NOT drawn from
 * `agent.rng` — mutating the agent's RNG stream from a DOM-event handler
 * would desync subsequent tick draws under replay. This RNG is the
 * demo's own resource; its seed is fixed at module load so training
 * runs are reproducible across reloads.
 */
function createTrainRng(seed = 0xC0FFEE): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
const trainRng = createTrainRng();
```

- [ ] **Step 3: Replace the Train-button handler**

Find the existing Train button handler (it calls the old brainjs `network.train`). Replace with:

```ts
async function onTrainClick(agent: Agent, reasoner: TfjsReasoner<number[], number[]>): Promise<void> {
  const pairs = gatherTrainingPairs(agent); // unchanged helper
  await reasoner.train(pairs, {
    epochs: 200,
    learningRate: 0.1,
    seed: Math.floor(trainRng() * 0x7fff_ffff),
  });
  const snapshot = reasoner.toJSON();
  const agentId = agent.identity?.id ?? 'default';
  globalThis.localStorage?.setItem(
    `agentonomous/${agentId}/tfjs-network`,
    JSON.stringify(snapshot),
  );
}
```

`TfjsReasoner` import goes at the top: `import type { TfjsReasoner } from 'agentonomous/cognition/adapters/tfjs';`.

- [ ] **Step 4: Dispose outgoing reasoner on mode swap**

Find the `onChange(newMode)` handler; before setting the new reasoner, dispose the old:

```ts
// Before: agent.setReasoner(newReasoner);
const previous = agent.getReasoner?.();
(previous as { dispose?: () => void } | undefined)?.dispose?.();
agent.setReasoner(newReasoner);
```

If `agent.getReasoner` isn't a thing, track the last-constructed reasoner in module-local state instead. Inspect the existing switcher code to pick the idiom that fits.

- [ ] **Step 5: Demo typecheck**

```bash
cd examples/nurture-pet
npx tsc --noEmit
cd ../..
```

Expected: no errors.

---

### Task 7.5: Update `tests/examples/learningMode.train.test.ts` to real tfjs

**Files:**

- Modify: `tests/examples/learningMode.train.test.ts`

This test imported the brain-js.ts stub and asserted `stub.lastTrainPairs()`. We rewrite its assertions to operate on the real adapter's snapshot.

- [ ] **Step 1: Replace stub imports with real tfjs imports**

```diff
 import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

 import { mountCognitionSwitcher } from '../../examples/nurture-pet/src/cognitionSwitcher.js';
 import { setLearningAgentId } from '../../examples/nurture-pet/src/cognition/learning.js';
 import { mountResetButton } from '../../examples/nurture-pet/src/ui.js';
-import { NeuralNetwork as StubNeuralNetwork } from './stubs/brain-js.js';
+import '@tensorflow/tfjs-backend-cpu';
+import * as tf from '@tensorflow/tfjs-core';
```

- [ ] **Step 2: Ensure the CPU backend is ready before tests**

Add a `beforeAll`:

```ts
beforeAll(async () => {
  await tf.setBackend('cpu');
  await tf.ready();
});
```

- [ ] **Step 3: Rewrite stub-specific assertions**

Find any test that did `expect(stub.lastTrainPairs()).toBeDefined()` or similar. Replace with localStorage-level assertions:

```ts
// After clicking Train and flushing promises:
const stored = globalThis.localStorage.getItem('agentonomous/test-agent/tfjs-network');
expect(stored).not.toBeNull();
const parsed = JSON.parse(stored!);
expect(parsed.version).toBe(1);
expect(typeof parsed.weights).toBe('string');
expect(parsed.weights.length).toBeGreaterThan(0);
```

(Adjust the agent id — `'test-agent'` — to whatever the test's existing setup uses.)

- [ ] **Step 4: Run the updated test**

```bash
npx vitest run tests/examples/learningMode.train.test.ts
```

Expected: passes. If the train step takes noticeably longer than before, that's normal — real tfjs vs the instant stub; a 5→1 model with ~200 epochs runs in ~50ms on CPU.

---

### Task 7.6: Update `cognitionSwitcher.test.ts` for the new `peerName`

**Files:**

- Modify: `tests/examples/cognitionSwitcher.test.ts`

- [ ] **Step 1: Update peerName assertion**

```diff
-  const peerName = opt.getAttribute('data-peer');
-  expect(peerName).toBe('brain.js');
+  const peerName = opt.getAttribute('data-peer');
+  expect(peerName).toBe('@tensorflow/tfjs-core');
```

(If the current test matches against a different attribute or title string, adjust accordingly. The `Install brain.js to enable` tooltip now reads `Install @tensorflow/tfjs-core to enable`.)

- [ ] **Step 2: Run**

```bash
npx vitest run tests/examples/cognitionSwitcher.test.ts
```

Expected: passes.

- [ ] **Step 3: Full `verify`**

```bash
npm run verify
```

Expected: all tests pass, build succeeds.

- [ ] **Step 4: Commit the demo migration**

```bash
git add examples/nurture-pet/src/cognition/learning.ts \
        examples/nurture-pet/src/cognitionSwitcher.ts \
        tests/examples/learningMode.train.test.ts \
        tests/examples/cognitionSwitcher.test.ts
git commit -m "feat(demo): rewire Learning mode to TfjsReasoner

- learning.ts: lazy-load @tensorflow/tfjs-backend-cpu + the tfjs
  adapter; hydrate from localStorage or the bundled baseline;
  fallback on corrupted snapshot
- cognitionSwitcher.ts: demo-local trainRng decoupled from agent.rng
  (preserves tick-replay determinism); dispose() outgoing reasoner
  on mode swap; localStorage key renamed to tfjs-network
- demo tests: drop the brain-js.ts stub and assert the localStorage
  snapshot shape; peerName string now @tensorflow/tfjs-core"
```

---

## Chunk 8: Cleanup — delete brainjs, changeset, docs, final verify

Final chunk. Remove every brainjs artifact (adapter source, tests, stub, vitest alias, peer-dep entry, lib entry, subpath export, size-limit row, demo devDep). Write the changeset. Update README prose. Run the full pre-PR gate.

### Task 8.1: Delete brainjs adapter source

**Files:** (deletions)

- Delete: `src/cognition/adapters/brainjs/index.ts`
- Delete: `src/cognition/adapters/brainjs/BrainJsReasoner.ts`
- Delete: `src/cognition/adapters/brainjs/brain.d.ts`

- [ ] **Step 1: Delete the directory**

```bash
git rm -r src/cognition/adapters/brainjs
```

Expected: 3 files removed.

- [ ] **Step 2: Delete the unit test**

```bash
git rm tests/unit/cognition/adapters/BrainJsReasoner.test.ts
```

- [ ] **Step 3: Delete the test stub**

```bash
git rm tests/examples/stubs/brain-js.ts
```

(If `tests/examples/stubs/` becomes empty, leave it; a future sibling stub might land there.)

- [ ] **Step 4: Typecheck to find stragglers**

```bash
npm run typecheck
```

Expected: no errors. If errors surface (e.g., an import still pointing at brainjs/index.js somewhere), fix them inline — they're leftovers from the migration.

---

### Task 8.2: Remove brainjs from build + export config

**Files:**

- Modify: `vite.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Remove brain.js from externalPackages**

In `vite.config.ts`:

```diff
 const externalPackages = [
   '@anthropic-ai/sdk',
   '@tensorflow/tfjs-core',
   '@tensorflow/tfjs-layers',
-  'brain.js',
   'excalibur',
   ...
 ];
```

- [ ] **Step 2: Remove brainjs lib entry**

```diff
     'cognition/adapters/js-son/index': resolve(__dirname, 'src/cognition/adapters/js-son/index.ts'),
-    'cognition/adapters/brainjs/index': resolve(__dirname, 'src/cognition/adapters/brainjs/index.ts'),
     'cognition/adapters/tfjs/index': resolve(__dirname, 'src/cognition/adapters/tfjs/index.ts'),
```

- [ ] **Step 3: Remove brain.js vitest alias**

Find and delete the ~15-line block (currently around lines 164–178) that aliases `brain.js` → `tests/examples/stubs/brain-js.ts`. The block starts with a long comment about "`brain.js` is an optional peer…"; delete the whole comment + alias object.

- [ ] **Step 3b: Remove the brainjs subpath vitest alias**

A separate alias entry (lines 157–158 in the pre-swap file) maps `^agentonomous/cognition/adapters/brainjs$` → the brainjs source. Delete it:

```diff
-      {
-        find: /^agentonomous\/cognition\/adapters\/brainjs$/,
-        replacement: resolve(__dirname, 'src/cognition/adapters/brainjs/index.ts'),
-      },
       {
         find: /^agentonomous\/cognition\/adapters\/tfjs$/,
         replacement: resolve(__dirname, 'src/cognition/adapters/tfjs/index.ts'),
       },
```

- [ ] **Step 3c: Remove the brainjs ambient-dts copy entry**

The top-of-file `ambientDtsEntries` array has a brainjs entry (around lines 46–50) that copies `brain.d.ts` into `dist/` and prepends `/// <reference>` lines to brainjs's emitted `.d.ts` files. Delete the whole object entry:

```diff
   {
     from: 'src/cognition/adapters/js-son/js-son-agent.d.ts',
     to: 'dist/cognition/adapters/js-son/js-son-agent.d.ts',
     referencedBy: [
       'dist/cognition/adapters/js-son/index.d.ts',
       'dist/cognition/adapters/js-son/JsSonReasoner.d.ts',
     ],
   },
-  {
-    from: 'src/cognition/adapters/brainjs/brain.d.ts',
-    to: 'dist/cognition/adapters/brainjs/brain.d.ts',
-    referencedBy: [
-      'dist/cognition/adapters/brainjs/index.d.ts',
-      'dist/cognition/adapters/brainjs/BrainJsReasoner.d.ts',
-    ],
-  },
 ];
```

(tfjs doesn't need an ambient shim — `@tensorflow/tfjs-core` + `-layers` ship real types.)

- [ ] **Step 3d: Update the file-header comment block**

Near the top of `vite.config.ts` (around lines 7–15), the comment block enumerating the adapter entry points mentions brain.js. Swap it for tfjs:

```diff
 // - js-son:      src/cognition/adapters/js-son/index.ts
 //                                                    → dist/cognition/adapters/js-son/index.js
-// - brain.js:    src/cognition/adapters/brainjs/index.ts
-//                                                    → dist/cognition/adapters/brainjs/index.js
+// - tfjs:        src/cognition/adapters/tfjs/index.ts
+//                                                    → dist/cognition/adapters/tfjs/index.js
```

- [ ] **Step 4: Remove brainjs subpath from package.json exports**

```diff
-  "./cognition/adapters/brainjs": {
-    "import": "./dist/cognition/adapters/brainjs/index.js",
-    "types": "./dist/cognition/adapters/brainjs/index.d.ts"
-  },
   "./cognition/adapters/tfjs": {
     ...
   },
```

- [ ] **Step 5: Remove brainjs size-limit row**

```diff
-  {
-    "name": "dist/cognition/adapters/brainjs/index.js (gzip)",
-    "path": "dist/cognition/adapters/brainjs/index.js",
-    "gzip": true,
-    "limit": "2 KB"
-  },
   {
     "name": "dist/cognition/adapters/tfjs/index.js (gzip)",
     ...
   }
```

- [ ] **Step 6: Remove brain.js from peerDependencies and peerDependenciesMeta**

```diff
   "peerDependencies": {
     "@anthropic-ai/sdk": "*",
-    "brain.js": "^2.0.0-beta.0",
     "@tensorflow/tfjs-core": "^4.22.0",
     ...
   },
   "peerDependenciesMeta": {
     "@anthropic-ai/sdk": { "optional": true },
-    "brain.js": { "optional": true },
     "@tensorflow/tfjs-core":   { "optional": true },
     ...
   }
```

- [ ] **Step 7: Reinstall at root**

```bash
npm install --no-audit --no-fund
```

Expected: `package-lock.json` drops brain.js and its transitive tree. Packages removed typically in the 100+ range (brain.js pulls gpu.js + gl + node-gyp + tar + …).

---

### Task 8.3: Remove brain.js from demo deps

**Files:**

- Modify: `examples/nurture-pet/package.json`

- [ ] **Step 1: Delete brain.js line**

```diff
   "devDependencies": {
     "@tensorflow/tfjs-backend-cpu": "^4.22.0",
     "@tensorflow/tfjs-core": "^4.22.0",
     "@tensorflow/tfjs-layers": "^4.22.0",
-    "brain.js": "^2.0.0-beta.0",
     "js-son-agent": "^0.0.17",
     ...
   }
```

- [ ] **Step 2: Reinstall demo deps**

```bash
cd examples/nurture-pet
npm install --no-audit --no-fund
cd ../..
```

Expected: demo lockfile shrinks significantly.

- [ ] **Step 3: Audit the demo**

```bash
cd examples/nurture-pet
npm audit --omit=dev 2>&1 | tail -5
cd ../..
```

Expected: `found 0 vulnerabilities` (the entire 10-CVE chain was brain.js's). If non-zero, they're new and unrelated — flag to the human.

---

### Task 8.4a: Delete the un-consumed old brainjs changeset

**Files:** (deletion)

- Delete: `.changeset/cognition-adapter-brainjs.md`

The old brainjs changeset is still in `.changeset/` (un-consumed — never collapsed into a CHANGELOG because agentonomous hasn't cut a release yet). Since we're removing the feature it documents in the same PR, the changeset describes a surface that will no longer exist. Delete it; the new changeset (Task 8.4b) replaces it.

- [ ] **Step 1: Delete the file**

```bash
git rm .changeset/cognition-adapter-brainjs.md
```

Expected: removed from the index.

---

### Task 8.4b: Write the changeset

**Files:**

- Create: `.changeset/cognition-adapter-tfjs.md`

- [ ] **Step 1: Create the changeset file**

```markdown
---
'agentonomous': minor
---

Replace the `cognition/adapters/brainjs` subpath with a
TensorFlow.js-backed `cognition/adapters/tfjs`. `brain.js` was
effectively abandoned (10 open CVEs in its transitive build chain,
no upstream fix path), and the new adapter is a real upgrade — it
owns the full model lifecycle with `train()`, `toJSON()` /
`fromJSON()`, and deterministic inference under the default CPU
backend.

**Breaking:** the `cognition/adapters/brainjs` subpath export is
removed. Consumers who imported `BrainJsReasoner` migrate to
`TfjsReasoner`:

```ts
// Before
import { BrainJsReasoner } from 'agentonomous/cognition/adapters/brainjs';
import { NeuralNetwork } from 'brain.js';
const reasoner = new BrainJsReasoner({
  network: new NeuralNetwork().fromJSON(savedJson),
  featuresOf, interpret,
});

// After
import '@tensorflow/tfjs-backend-cpu';
import { TfjsReasoner } from 'agentonomous/cognition/adapters/tfjs';
const reasoner = await TfjsReasoner.fromJSON(savedSnapshot, { featuresOf, interpret });
```

The new adapter persists via a plain-JSON snapshot (topology +
base64 weights + shape manifest) rather than brain.js's `toJSON()`
format — stored weights don't migrate, but a fresh Train run
regenerates them in the demo.

See `docs/specs/2026-04-24-tfjs-cognition-adapter-design.md` for the
full design rationale, `docs/plans/2026-04-24-tfjs-cognition-adapter.md`
for the implementation trail.
```

---

### Task 8.5: Update README prose

**Files:**

- Modify: `README.md`
- Modify: `examples/nurture-pet/README.md`

- [ ] **Step 1: Root README**

Find any mention of `brain.js` or "brain.js-backed learning". Replace with tfjs equivalents. At minimum the "Running the example" section's "Learning (brain.js)" reference becomes "Learning (tfjs)". Search:

```bash
grep -n "brain\.js\|brainjs" README.md
```

Edit each match to reference `@tensorflow/tfjs-core` / `tfjs` / the new adapter subpath.

- [ ] **Step 2: Demo README**

```bash
grep -n "brain\.js\|brainjs" examples/nurture-pet/README.md
```

Same treatment.

---

### Task 8.6: Final pre-PR gate

- [ ] **Step 1: Full `verify`**

```bash
npm run verify
```

Expected: format, lint, typecheck, all tests, build all pass. Total test count higher than before by roughly 10 (TfjsSnapshot codec + TfjsReasoner tests added, minus the deleted brainjs test).

- [ ] **Step 2: Size check**

```bash
npm run size
```

Expected: every row within budget, including the new tfjs row at 3 KB.

- [ ] **Step 3: Demo build**

```bash
cd examples/nurture-pet
npm run build
cd ../..
```

Expected: clean build; no `gl`, `gpu.js`, `node-gyp`, `tar` warnings. The demo's `dist/` should be ~350–450 KB gzipped for the biggest chunk (tfjs runtime), smaller than the ~540 KB brain.js chunk it replaces.

- [ ] **Step 4: Graphify refresh (author-side)**

Per `CLAUDE.md`'s graphify rules, this is a local post-session chore:

```bash
graphify update .
```

Expected: graph regenerates in seconds (AST-only, no API cost). The `BrainJsReasoner` node in the Cognition Adapters community gets replaced by `TfjsReasoner`.

---

### Task 8.7: Final commit + PR

- [ ] **Step 1: Commit the cleanup**

```bash
git add -A
git status
```

Expected: every brainjs-related file removed from the index; package.json / vite.config.ts / README.md / demo README / demo package.json / lockfiles modified; new `.changeset/cognition-adapter-tfjs.md` added.

```bash
git commit -m "chore(cognition/adapters/brainjs): remove — replaced by tfjs

Final cleanup of the brainjs adapter after the TfjsReasoner swap:

- deleted src/cognition/adapters/brainjs/ (3 files)
- deleted tests/unit/cognition/adapters/BrainJsReasoner.test.ts
- deleted tests/examples/stubs/brain-js.ts
- removed brain.js from peerDependencies / peerDependenciesMeta
- removed the brainjs lib entry and externalPackages entry in vite.config.ts
- removed the brain.js vitest alias block
- removed the brainjs subpath from package.json exports + size-limit
- removed brain.js from the demo's devDependencies
- README / examples/nurture-pet/README updated
- .changeset/cognition-adapter-tfjs.md added (minor bump)

npm audit on the demo now reports 0 vulnerabilities (was 10)."
```

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/tfjs-cognition-adapter
```

- [ ] **Step 2b: Confirm gh CLI is authenticated**

```bash
gh auth status
```

Expected: `Logged in to github.com account <user>` with `repo` scope. If not authenticated, run `gh auth login` before the next step.

- [ ] **Step 3: Open the PR targeting `develop`**

```bash
gh pr create --base develop --title "feat(cognition/adapters): swap brainjs for tfjs" --body "$(cat <<'EOF'
## Summary
- Replace the abandoned `brain.js` cognition adapter with a TensorFlow.js-backed `TfjsReasoner` that owns the full model lifecycle (construct, inference, train, persist, dispose).
- Drops the 10-CVE `brain.js` → `gpu.js` → `gl` → `node-gyp` → `tar`/`cacache` chain; `npm audit` on the demo now reports 0 vulnerabilities.
- Demo's Learning mode keeps the same first-impression UX (hand-authored baseline weights, Train-button produces a rehydratable snapshot) but runs on tfjs under the hood.

## Design
- Spec: `docs/specs/2026-04-24-tfjs-cognition-adapter-design.md`
- Plan: `docs/plans/2026-04-24-tfjs-cognition-adapter.md`

## Test plan
- [x] `npm run verify` green (format, lint, typecheck, tests, build)
- [x] `npm run size` within budget (new 3 KB tfjs row)
- [x] Demo builds cleanly (no `gl`/`gpu.js`/`node-gyp` native steps)
- [x] `npm audit` on the demo: 0 vulnerabilities
- [ ] Manual: switch to "Learning (tfjs)" in the demo, click Train, reload page, verify the pet's behaviour adapted
- [ ] Manual: `reset()` is NOT implemented; verify the switcher's reset flow doesn't call it (optional `?.()` guard should handle)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opens with the summary, test plan, and design-doc links. CI picks it up from there.

---

## Done

At this point:

- brainjs adapter is gone from the codebase.
- `TfjsReasoner` ships via `agentonomous/cognition/adapters/tfjs`.
- Demo's Learning mode runs on tfjs, with deterministic inference and reproducible training.
- 10-CVE `brain.js` transitive chain eliminated.
- `npm run verify` + `size-limit` gate is green.
- Spec, plan, and changeset trail is committed.

PR merges after review → `develop` → next scheduled demo promotion → GitHub Pages gets the tfjs-backed Learning mode.
