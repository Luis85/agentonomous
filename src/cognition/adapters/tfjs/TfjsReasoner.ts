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
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
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
    const flatArray = tf.tidy(() => {
      const inputTensor = features instanceof tf.Tensor ? features : tf.tensor([features as never]);
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
