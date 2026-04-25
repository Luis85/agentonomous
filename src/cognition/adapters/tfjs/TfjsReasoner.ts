import * as tf from '@tensorflow/tfjs-core';
import { models, type Sequential } from '@tensorflow/tfjs-layers';
import type { Intention } from '../../Intention.js';
import type { IntentionCandidate } from '../../IntentionCandidate.js';
import type { Reasoner, ReasonerContext } from '../../reasoning/Reasoner.js';
import { decodeWeights, encodeWeights, type TfjsSnapshot } from './TfjsSnapshot.js';

const BACKEND_PACKAGES: Record<'cpu' | 'wasm' | 'webgl', string> = {
  cpu: '@tensorflow/tfjs-backend-cpu',
  wasm: '@tensorflow/tfjs-backend-wasm',
  webgl: '@tensorflow/tfjs-backend-webgl',
};

/**
 * Probe order used by `TfjsReasoner.detectBestBackend`. WebGL first
 * (fastest when GPU is available), WASM second (faster than CPU on most
 * desktops), CPU last (always available).
 */
const BACKEND_PROBE_ORDER = ['webgl', 'wasm', 'cpu'] as const;

/**
 * Side-effect-import the `@tensorflow/tfjs-backend-*` package matching
 * `name`. Each branch uses a literal-string `import()` so Vite's static
 * analysis can emit a per-backend async chunk; passing `name` directly
 * to `import()` would either inline all three packages into the calling
 * chunk or fail at build time.
 */
async function loadBackendModule(name: 'cpu' | 'wasm' | 'webgl'): Promise<void> {
  switch (name) {
    case 'cpu':
      await import('@tensorflow/tfjs-backend-cpu');
      return;
    case 'wasm':
      await import('@tensorflow/tfjs-backend-wasm');
      return;
    case 'webgl':
      await import('@tensorflow/tfjs-backend-webgl');
      return;
  }
}

/**
 * True inquiry-only probe: side-effect-import the backend's package
 * (which calls `tf.registerBackend(...)` at module top, populating
 * `tf.engine().registryFactory`) and resolve `true` iff the factory
 * is now present in the registry.
 *
 * No `tf.setBackend` call, no kernel `setupFunc` reinit, no factory
 * invocation, no GPU/WASM allocation. Calling this while a live
 * `TfjsReasoner` is mid-`fit()` cannot disturb its active backend
 * instance, kernels, or tensor data.
 *
 * Caveat: a registered factory does NOT guarantee the backend can
 * actually activate on this device. The factory itself may throw on
 * first use (e.g. WebGL in headless Node — no GL context). For the
 * strictest "this WILL work" check, attempt `tf.setBackend(name)` and
 * inspect the boolean return; that is what `detectBestBackend` does.
 */
async function probeBackendInternal(name: 'cpu' | 'wasm' | 'webgl'): Promise<boolean> {
  try {
    await loadBackendModule(name);
    return tf.findBackendFactory(name) !== null;
  } catch {
    return false;
  }
}

/**
 * Minimal linear-congruential generator. Not cryptographic — just
 * repeatable under a fixed seed. Matches the LCG pattern used elsewhere
 * in the library's seeded test helpers.
 */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0 || 1;
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
  // `noUncheckedIndexedAccess` widens `arr[i]` to `T | undefined`. The
  // loop bounds keep both indices in range, so the cast back to `T` is
  // safe and avoids non-null assertions.
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = arr[i] as T;
    const b = arr[j] as T;
    arr[i] = b;
    arr[j] = a;
  }
}

/**
 * Normalise whatever `featuresOf` returned into a 2D `tf.Tensor` suitable
 * for `model.predict`. Accepts a `tf.Tensor` (passed through), a
 * `number[]` (wrapped to shape `[1, N]`), a nested `number[][]` (treated
 * as a batch), or any `TypedArray` subclass (wrapped to `[1, N]`).
 *
 * Throws a typed error for anything else — most commonly a
 * `Record<string, number>` from a brain.js-era `featuresOf` migration,
 * where the object's key order isn't a stable feature ordering. The
 * message nudges migrators toward an explicit ordered projection.
 */
function toInputTensor(features: unknown): tf.Tensor {
  if (features instanceof tf.Tensor) return features as tf.Tensor;
  if (Array.isArray(features) || ArrayBuffer.isView(features)) {
    return tf.tensor([features as never]);
  }
  const got = features === null ? 'null' : typeof features;
  throw new TypeError(
    `TfjsReasoner.featuresOf must return a tf.Tensor, number[] (single ` +
      `sample), number[][] (batch), or a TypedArray. Got ${got}. ` +
      `Migrating from brain.js? Map the record to an ordered number[] ` +
      `via an explicit key list — Object.values alone has no guaranteed ` +
      `iteration order for non-integer keys across all JS engines.`,
  );
}

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

/**
 * Helpers passed to the consumer-provided `featuresOf` and `interpret`
 * callbacks. Same shape as the js-son adapter's helpers so demo code
 * can swap adapters at call site without plumbing changes.
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
 * emits is extracted via `.dataSync()` and passed to `interpret` as `Out`.
 *
 * `backend` defaults to `'cpu'`. If the current tfjs backend doesn't
 * match, the constructor throws `TfjsBackendNotRegisteredError`; it does
 * NOT call `tf.setBackend()` itself because that's async. Use the async
 * `TfjsReasoner.fromJSON()` factory for backends that need registration.
 */
export type TfjsReasonerOptions<In, Out> = {
  model: Sequential;
  featuresOf: (ctx: ReasonerContext, helpers: TfjsHelpers) => In;
  interpret: (output: Out, ctx: ReasonerContext, helpers: TfjsHelpers) => Intention | null;
  backend?: 'cpu' | 'wasm' | 'webgl';
};

/**
 * Options for `TfjsReasoner.train`.
 */
export type TrainOptions = {
  epochs?: number;
  batchSize?: number;
  /**
   * Placeholder — the consumer-compiled model's optimizer owns the
   * learning rate. Ignored by the adapter; kept here so the option shape
   * is forward-compatible if/when we expose optimizer rebuild support.
   */
  learningRate?: number;
  shuffle?: boolean;
  seed?: number;
  /**
   * Per-epoch progress callback. Fires synchronously after each
   * `model.fit` epoch completes with the 0-indexed epoch number and
   * that epoch's loss. Use it to drive a progress UI ("Training… 42/100")
   * or a live loss-curve renderer.
   *
   * @remarks Determinism note: the callback runs on the same backend +
   * microtask stage as the rest of the fit; no scheduling is added.
   */
  onEpochEnd?: (epoch: number, loss: number) => void;
};

/**
 * Result of `TfjsReasoner.train` — final epoch loss plus full per-epoch
 * loss history.
 */
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
 * Lifecycle: `train(pairs, opts)` updates in-place (weights mutate);
 * `toJSON()` / `fromJSON(snapshot)` round-trip a full model through a
 * plain-JSON `TfjsSnapshot`; `dispose()` releases tensor memory.
 *
 * @example N-way softmax over a fixed skill set
 *
 * The forward pass returns the model's output flattened via
 * `dataSync()`, so a softmax head emits a `number[]` whose entries sum
 * to 1. `interpret` picks `argmax` and maps the index to one of K
 * intention ids:
 *
 * ```ts
 * const SKILLS = ['feed', 'clean', 'play', 'rest', 'pet'] as const;
 * const model = sequential();
 * model.add(layers.dense({ units: 16, activation: 'sigmoid', inputShape: [5] }));
 * model.add(layers.dense({ units: SKILLS.length, activation: 'softmax' }));
 * model.compile({ optimizer: tf.train.sgd(0.1), loss: 'categoricalCrossentropy' });
 *
 * const reasoner = new TfjsReasoner<number[], number[]>({
 *   model,
 *   featuresOf: (_ctx, helpers) => Object.values(helpers.needsLevels()),
 *   interpret: (output) => {
 *     let argmax = 0;
 *     for (let i = 1; i < output.length; i++) {
 *       if ((output[i] ?? 0) > (output[argmax] ?? 0)) argmax = i;
 *     }
 *     const top = output[argmax] ?? 0;
 *     if (top < 0.2) return null; // idle below confidence floor
 *     return { kind: 'satisfy', type: SKILLS[argmax]! };
 *   },
 * });
 * ```
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

    // `featuresOf` runs INSIDE `tf.tidy` so any `tf.Tensor` it allocates
    // (fresh or returned directly) is tracked and disposed with the
    // forward-pass scratch. Consumers must treat a returned tensor as
    // single-use per tick — a long-lived cached tensor would be disposed
    // on the first call and fail on the next.
    const flatArray = tf.tidy(() => {
      const features = this.featuresOf(ctx, helpers);
      const inputTensor = toInputTensor(features);
      const predictionTensor = this.model.predict(inputTensor) as tf.Tensor;
      return Array.from(predictionTensor.dataSync());
    });
    const output = flatArray as unknown as Out;
    return this.interpret(output, ctx, helpers);
  }

  getModel(): Sequential {
    return this.model;
  }

  dispose(): void {
    this.model.dispose();
  }

  /**
   * Supervised training over `pairs` via `model.fit`. Pre-shuffles with a
   * seeded LCG + Fisher-Yates so tfjs's own `Math.random`-based shuffle
   * never runs (that would leak non-determinism into CI runs and replay).
   *
   * @remarks Determinism is best-effort. Verified stable to ~3 decimal
   * places on `@tensorflow/tfjs-layers@^4.22.0` CPU backend; tighter
   * tolerances are not guaranteed because tfjs's internal init/numerical
   * paths can drift across minor releases.
   */
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

    const shuffled = [...pairs];
    if (opts.shuffle ?? true) {
      seededShuffle(shuffled, makeLcg(seed));
    }

    const featuresTensor = tf.tensor(shuffled.map((p) => p.features) as never);
    const labelsTensor = tf.tensor(shuffled.map((p) => p.label) as never);

    const onEpochEnd = opts.onEpochEnd;
    try {
      const history = await this.model.fit(featuresTensor, labelsTensor, {
        epochs,
        batchSize,
        shuffle: false,
        verbose: 0,
        ...(onEpochEnd
          ? {
              callbacks: {
                onEpochEnd: (epoch: number, logs?: { loss?: number }) => {
                  if (logs?.loss !== undefined) onEpochEnd(epoch, logs.loss);
                },
              },
            }
          : {}),
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

  /**
   * Serialise the model's topology + weights as a plain-JSON
   * `TfjsSnapshot`. Consumers can `JSON.stringify` the result and stash it
   * in localStorage; rehydrate with `TfjsReasoner.fromJSON(...)`.
   */
  toJSON(): TfjsSnapshot {
    // `LayersModel.getWeights()` returns the underlying weight-variable
    // tensors directly (via `LayerVariable.read()` — NOT clones), so we
    // read their host-side data via `dataSync()` without disposing them;
    // disposing here would destroy the model's backing storage.
    const weightTensors = this.model.getWeights();
    const weightsShapes = weightTensors.map((t) => [...t.shape]);
    const weightsArrays = weightTensors.map((t) => {
      const data = t.dataSync();
      return data instanceof Float32Array ? data : new Float32Array(data);
    });
    const topology = (
      this.model as unknown as { toJSON(unused: unknown, ret: boolean): unknown }
    ).toJSON(null, false);
    return {
      version: 1,
      topology,
      weights: encodeWeights(weightsArrays),
      weightsShapes,
    };
  }

  /**
   * Probe `webgl → wasm → cpu` in that order and return the first
   * backend that **activates** without throwing — i.e. its factory
   * runs successfully and `tf.setBackend(name)` resolves `true`.
   * Side-effect-imports the matching `@tensorflow/tfjs-backend-*`
   * package via lazy dynamic `import()`. On resolve, `tf.backend()`
   * is the value reported.
   *
   * Use this when a consumer has no preference (e.g. demo HUD that
   * opportunistically takes WebGL for speed). For a per-option "is
   * this backend's factory registered" check in a UI, see
   * `probeBackend(name)` — it is cheaper but does NOT verify the
   * factory will succeed on this device (WebGL registers fine in
   * headless Node but throws at first use).
   *
   * **Side effect on tfjs state.** This method DOES change
   * `tf.engine().backend` to whichever backend wins the chain. If a
   * `TfjsReasoner` is mid-`fit()` when this runs, the kernels and
   * `backendInstance` it relies on can flip out from under it. Per
   * `engine.ts:274-294` (tfjs 4.22) `setBackend` does NOT dispose
   * tensors — they lazy-migrate via `moveData` on next reuse — but
   * mid-fit kernel-setup churn is still a perf cliff. Call this at
   * boot, before any reasoner is constructed, when possible.
   *
   * **Determinism caveat.** GPU backends (`webgl`) are NOT
   * determinism-preserving — replay parity (`SeededRng` +
   * `ManualClock` → byte-identical `DecisionTrace`s) holds only on
   * the `cpu` backend. `wasm` reproduces across same-host runs but
   * float-rounding differs from `cpu`. Pass `'cpu'` explicitly to
   * the constructor for any session whose trace must be reproducible
   * across machines.
   *
   * Rejects with an `Error` if every backend fails to activate —
   * `cpu` is bundled and should always succeed, so the rejection
   * indicates a broken environment.
   */
  static async detectBestBackend(): Promise<'webgl' | 'wasm' | 'cpu'> {
    // Snapshot the prior backend (may be empty string when tf hasn't
    // initialized any backend yet). If every probe fails, attempt to
    // restore it before throwing — a failed `tf.setBackend` can leave
    // `engine.backendInstance` cleared, so a later inference call from
    // an unrelated code path would otherwise hit a broken global state
    // (Codex P1 round 10).
    const prior = tf.getBackend();
    for (const name of BACKEND_PROBE_ORDER) {
      try {
        await loadBackendModule(name);
        const ok = await tf.setBackend(name);
        if (ok) {
          await tf.ready();
          return name;
        }
      } catch {
        // Factory threw (e.g. WebGL in headless Node). Try next.
      }
    }
    // All-failed path: best-effort restore of the prior backend so the
    // rejection doesn't silently corrupt global tf state. If `prior`
    // was empty (no backend ever initialized) or the restore itself
    // throws, leave tf in whatever state the loop ended on — the
    // caller's `cpu`-bundled invariant has already been violated, so
    // there is no clean fallback.
    if (prior !== '') {
      try {
        await tf.setBackend(prior);
        await tf.ready();
      } catch {
        // Best-effort — surfacing this as a separate error would mask
        // the more useful rejection below.
      }
    }
    throw new Error(
      'TfjsReasoner.detectBestBackend: every backend (webgl, wasm, cpu) failed to activate. ' +
        'cpu is bundled and should always succeed — reaching this error indicates a broken environment.',
    );
  }

  /**
   * Pure-inquiry probe of a single tfjs backend. Side-effect-imports
   * the matching `@tensorflow/tfjs-backend-*` package — which calls
   * `tf.registerBackend(name, factory, priority)` at module top — and
   * resolves `true` iff the factory is afterwards present in
   * `tf.engine().registryFactory`.
   *
   * **No `tf.setBackend` call. No factory invocation. No
   * GPU/WASM/CPU resource allocation. No kernel reinit.** Calling
   * this while a live `TfjsReasoner` is mid-`fit()` cannot disturb
   * its tensors, kernels, or active backend instance. Safe to call
   * any time, in parallel, without coordinating with model
   * lifecycles.
   *
   * Use this to drive a per-option "is this backend's factory
   * available" check in a picker UI — the cheap, side-effect-free
   * way to enable / disable list items.
   *
   * **Limitation.** A registered factory does NOT guarantee the
   * backend can actually activate on this device. Two distinct
   * cases:
   *
   * 1. The package may decline to register at all in unsuitable
   *    environments — `@tensorflow/tfjs-backend-webgl@4.22` wraps
   *    its `registerBackend` call in `if (isBrowser())`, so the
   *    factory is never put into the registry under Node. The
   *    probe correctly reports `false` here.
   * 2. The package may register unconditionally but its factory
   *    throws at first use — `@tensorflow/tfjs-backend-wasm@4.22`
   *    behaves this way under runtime constraints (missing fetch
   *    shim, WebAssembly disabled). The probe reports `true`
   *    here even though `tf.setBackend(name)` would later fail.
   *
   * For the strictest "this WILL work" check, attempt
   * `tf.setBackend(name)` and inspect the boolean return; that is
   * what `detectBestBackend` does. UIs that need accurate disabled
   * state for case (2) should fall back via the try-and-revert
   * pattern on commit.
   */
  static async probeBackend(name: 'cpu' | 'wasm' | 'webgl'): Promise<boolean> {
    return probeBackendInternal(name);
  }

  /**
   * Async factory. Registers the requested tfjs backend if needed,
   * rebuilds the `Sequential` from the stored topology, applies the
   * decoded weights in original order, and returns a ready-to-use
   * reasoner. Rejects with `TfjsBackendNotRegisteredError` when the
   * requested backend can't be activated.
   *
   * The rebuilt model is **uncompiled** — inference works, but callers
   * who intend to `train()` must compile the model first (e.g. via
   * `reasoner.getModel().compile({ optimizer, loss })`).
   */
  static async fromJSON<In = unknown, Out = unknown>(
    snapshot: TfjsSnapshot,
    opts: Omit<TfjsReasonerOptions<In, Out>, 'model'>,
  ): Promise<TfjsReasoner<In, Out>> {
    if (snapshot.version !== 1) {
      throw new Error(
        `TfjsReasoner.fromJSON: unsupported snapshot version ${snapshot.version as number}`,
      );
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

    const rebuilt = (await models.modelFromJSON(
      snapshot.topology as never,
    )) as unknown as Sequential;

    const weightArrays = decodeWeights(snapshot.weights, snapshot.weightsShapes);
    const tensors = weightArrays.map((arr, i) =>
      tf.tensor(arr, snapshot.weightsShapes[i] as number[], 'float32'),
    );
    try {
      rebuilt.setWeights(tensors);
    } finally {
      for (const t of tensors) t.dispose();
    }

    return new TfjsReasoner<In, Out>({ ...opts, model: rebuilt });
  }
}
