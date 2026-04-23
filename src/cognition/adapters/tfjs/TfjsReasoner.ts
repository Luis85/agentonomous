import * as tf from '@tensorflow/tfjs-core';
import type { Sequential } from '@tensorflow/tfjs-layers';
import type { Intention } from '../../Intention.js';
import type { IntentionCandidate } from '../../IntentionCandidate.js';
import type { Reasoner, ReasonerContext } from '../../reasoning/Reasoner.js';
import type { TfjsSnapshot } from './TfjsSnapshot.js';

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
 * emits is extracted via `.dataSync()` and passed to `interpret` as `Out`.
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
 * Training / persistence methods (`train`, `toJSON`, `fromJSON`) land in
 * later chunks of the same PR — stubbed as rejecting promises / throwing
 * here so TypeScript sees the full surface.
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

  train(_pairs: Array<{ features: In; label: Out }>, _opts?: TrainOptions): Promise<TrainResult> {
    return Promise.reject(new Error('TfjsReasoner.train not yet implemented (Chunk 4)'));
  }

  toJSON(): TfjsSnapshot {
    throw new Error('TfjsReasoner.toJSON not yet implemented (Chunk 5)');
  }

  static fromJSON<In = unknown, Out = unknown>(
    _snapshot: TfjsSnapshot,
    _opts: Omit<TfjsReasonerOptions<In, Out>, 'model'>,
  ): Promise<TfjsReasoner<In, Out>> {
    return Promise.reject(new Error('TfjsReasoner.fromJSON not yet implemented (Chunk 5)'));
  }
}
