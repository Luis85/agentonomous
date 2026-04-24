import type { Learner, LearningOutcome } from '../../learning/Learner.js';
import type { TrainOptions, TrainResult } from './TfjsReasoner.js';

/**
 * Minimum training surface the learner actually uses. `TfjsReasoner`
 * satisfies this, but tests can pass a fake without a live tfjs backend.
 */
export interface TrainableReasoner<In, Out> {
  train(pairs: Array<{ features: In; label: Out }>, opts?: TrainOptions): Promise<TrainResult>;
}

/**
 * Construction options for `TfjsLearner`.
 */
export interface TfjsLearnerOptions<In, Out> {
  /**
   * The reasoner whose weights this learner trains. Usually a
   * `TfjsReasoner`, but any object implementing `train(pairs, opts)` with
   * the tfjs signature works — useful for tests + alt-backend adapters.
   */
  readonly reasoner: TrainableReasoner<In, Out>;
  /**
   * Project one `LearningOutcome` into a training pair. Return `null` to
   * skip the outcome (e.g. when `reward` is `undefined`, or when the
   * intention / action shape doesn't map to a meaningful feature vector).
   */
  readonly toTrainingPair: (outcome: LearningOutcome) => { features: In; label: Out } | null;
  /**
   * Train once the buffer accumulates this many eligible outcomes. The
   * learner pops exactly this many pairs off the head of the buffer per
   * batch; anything beyond stays for the next batch. Default: `50`.
   */
  readonly batchSize?: number;
  /**
   * Cap on the in-memory buffer. Oldest entries drop FIFO after this.
   * Default: `batchSize * 4` — enough slack to absorb a short burst of
   * outcomes while one batch is already training. Set to `Infinity` to
   * disable the cap (not recommended for long-running agents).
   */
  readonly bufferCapacity?: number;
  /**
   * Epochs passed through to `reasoner.train()`. Default: `20`.
   */
  readonly epochs?: number;
  /**
   * Deterministic shuffle seed passed through to `reasoner.train()`.
   * Default: `1`. In a multi-agent simulation you want this to be a
   * stable per-learner value — never `Date.now()` or `Math.random()`,
   * or replays drift.
   */
  readonly trainSeed?: number;
  /**
   * Fires after each batch completes training. Receives the
   * `TrainResult` the reasoner returned. Useful for sparkline / toast
   * wiring in demos.
   */
  readonly onBatchTrained?: (result: TrainResult) => void;
  /**
   * Fires when an error bubbles out of a background train triggered by
   * `score()`. The error is swallowed by the learner itself so a single
   * failed batch doesn't tear down the tick pipeline; the hook lets
   * consumers log or surface it. Synchronous calls made via `flush()`
   * still reject normally.
   */
  readonly onTrainError?: (error: unknown) => void;
}

/**
 * Closes Stage 8 (score) of the tick pipeline by turning `Learner` into
 * a real reinforcement seam: buffer `LearningOutcome`s, batch-train a
 * `TfjsReasoner` (or any `TrainableReasoner`-shaped object) every N
 * outcomes, and stay out of the tick loop's critical path by running
 * training asynchronously in the background.
 *
 * This is the "real" implementation that `NoopLearner`'s JSDoc pointed
 * at — the port was exposed in Phase A so the tick pipeline had a stable
 * Stage 8 seam; `TfjsLearner` is what consumers plug in when they want
 * the agent to actually learn.
 *
 * Determinism contract:
 * - `score()` never touches the agent's RNG stream. The buffer is a
 *   plain array; training draws its shuffle seed from `trainSeed` (a
 *   stable consumer-supplied value).
 * - `score()` never calls `Date.now()` or `setTimeout` / `setInterval`.
 *   Background training kicks off via a Promise chain; there is no
 *   wall-clock scheduler.
 * - Under a fixed `SeededRng` + `ManualClock`, the sequence of
 *   `LearningOutcome`s handed to `score()` is itself deterministic, so
 *   the batch boundaries, training pairs, and resulting weight updates
 *   are all reproducible.
 *
 * Typical wiring from `createAgent`:
 *
 * ```ts
 * const reasoner = await TfjsReasoner.fromJSON(snapshot, { featuresOf, interpret });
 * const learner = new TfjsLearner({
 *   reasoner,
 *   toTrainingPair: (o) => {
 *     if (o.reward === undefined) return null;
 *     return { features: projectOutcomeFeatures(o), label: [o.reward] };
 *   },
 *   batchSize: 50,
 *   onBatchTrained: (r) => console.log('batch loss', r.finalLoss),
 * });
 * const agent = createAgent({ id, species, reasoner, learner });
 * ```
 *
 * Call `flush()` at end-of-episode / save-game boundaries to drain the
 * buffer even if it hasn't hit `batchSize`.
 */
export class TfjsLearner<In = unknown, Out = unknown> implements Learner {
  private readonly buffer: Array<{ features: In; label: Out }> = [];
  private inflight: Promise<TrainResult | null> | null = null;
  private disposed = false;

  constructor(private readonly opts: TfjsLearnerOptions<In, Out>) {}

  /**
   * Stage-8 hook. Projects the outcome into a training pair (consumer-
   * supplied) and buffers it. Kicks off a background training run once
   * the buffer reaches `batchSize`.
   */
  score(outcome: LearningOutcome): void {
    if (this.disposed) return;
    const pair = this.opts.toTrainingPair(outcome);
    if (pair === null) return;
    this.buffer.push(pair);
    const cap = this.capacity();
    while (this.buffer.length > cap) this.buffer.shift();
    this.maybeScheduleTrain();
  }

  /**
   * Force a training batch on whatever the buffer currently holds, even
   * if it hasn't hit `batchSize`. Waits on any already-inflight batch
   * first so the in-flight run's outcome isn't lost. Returns `null` when
   * the buffer is empty.
   */
  async flush(): Promise<TrainResult | null> {
    if (this.disposed) return null;
    if (this.inflight !== null) await this.inflight;
    if (this.buffer.length === 0) return null;
    return this.runTrain();
  }

  /**
   * True if a background batch is currently training. Useful for demos
   * that want to flag the reasoner as "busy" in the UI.
   */
  isTraining(): boolean {
    return this.inflight !== null;
  }

  /**
   * Current buffered-outcome count. Observable for demos / tests.
   */
  bufferedCount(): number {
    return this.buffer.length;
  }

  /**
   * Drop the buffer and mark the learner inert. Any in-flight background
   * training is left to complete on its own (cancelling a `model.fit`
   * mid-batch is not safe) — but `score()` calls after `dispose()`
   * no-op, so no new batches start.
   */
  dispose(): void {
    this.disposed = true;
    this.buffer.length = 0;
  }

  private batchSize(): number {
    // Clamp to ≥ 1 so a caller-supplied `batchSize: 0` or a negative
    // value doesn't turn `score()` into a no-op or `runTrain` into an
    // infinite-zero-slice loop.
    return Math.max(1, this.opts.batchSize ?? 50);
  }

  private capacity(): number {
    // Clamp to ≥ 0 so a negative `bufferCapacity` (or a negative
    // derived default) can't turn the buffer-trim loop into a hang —
    // `buffer.length > cap` would stay true at 0 when `cap` is negative.
    return Math.max(0, this.opts.bufferCapacity ?? this.batchSize() * 4);
  }

  /**
   * Start a background train if the buffer has enough pairs and no
   * training is currently running. Called both from `score()` and from
   * the tail of a previous `trainBackground()` run so consecutive full
   * batches drain without the caller having to invoke `flush()`.
   */
  private maybeScheduleTrain(): void {
    if (this.disposed) return;
    if (this.inflight !== null) return;
    if (this.buffer.length < this.batchSize()) return;
    void this.trainBackground();
  }

  private async trainBackground(): Promise<void> {
    const promise = this.runTrain().catch((err: unknown) => {
      this.opts.onTrainError?.(err);
      return null;
    });
    this.inflight = promise;
    try {
      await promise;
    } finally {
      this.inflight = null;
      // Drain any batches that queued up while this one was training.
      this.maybeScheduleTrain();
    }
  }

  private async runTrain(): Promise<TrainResult | null> {
    if (this.buffer.length === 0) return null;
    const batch = this.buffer.splice(0, this.batchSize());
    const result = await this.opts.reasoner.train(batch, {
      epochs: this.opts.epochs ?? 20,
      seed: this.opts.trainSeed ?? 1,
    });
    this.opts.onBatchTrained?.(result);
    return result;
  }
}
