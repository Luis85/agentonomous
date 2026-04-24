import { describe, expect, it, vi } from 'vitest';
import { TfjsLearner } from '../../../../src/cognition/adapters/tfjs/TfjsLearner.js';
import type {
  TrainOptions,
  TrainResult,
} from '../../../../src/cognition/adapters/tfjs/TfjsReasoner.js';
import type { LearningOutcome } from '../../../../src/cognition/learning/Learner.js';

/**
 * Fake `TrainableReasoner` that records every `train()` invocation
 * without touching tfjs. The training result is deterministic so the
 * learner's batching / flushing logic can be asserted without pulling a
 * backend in.
 */
function makeFakeReasoner(): {
  train: (
    pairs: ReadonlyArray<{ features: number[]; label: number[] }>,
    opts?: TrainOptions,
  ) => Promise<TrainResult>;
  calls: Array<{ pairs: Array<{ features: number[]; label: number[] }>; opts: TrainOptions }>;
} {
  const calls: Array<{
    pairs: Array<{ features: number[]; label: number[] }>;
    opts: TrainOptions;
  }> = [];
  return {
    calls,
    train(pairs, opts = {}): Promise<TrainResult> {
      calls.push({
        pairs: pairs.map((p) => ({ features: [...p.features], label: [...p.label] })),
        opts: { ...opts },
      });
      const n = pairs.length;
      return Promise.resolve({
        finalLoss: n === 0 ? 0 : 1 / n,
        history: { loss: [1, 0.5, 1 / Math.max(n, 1)] },
      });
    },
  };
}

function outcome(reward: number | undefined): LearningOutcome {
  return {
    intention: { kind: 'satisfy', type: 'satisfy-need:hunger' },
    actions: [],
    ...(reward !== undefined ? { reward } : {}),
  };
}

describe('TfjsLearner', () => {
  const project = (o: LearningOutcome): { features: number[]; label: number[] } | null => {
    if (o.reward === undefined) return null;
    return { features: [o.reward], label: [o.reward] };
  };

  it('buffers outcomes without calling train() below batchSize', () => {
    const fake = makeFakeReasoner();
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: fake,
      toTrainingPair: project,
      batchSize: 3,
    });
    learner.score(outcome(0.1));
    learner.score(outcome(0.2));
    expect(learner.bufferedCount()).toBe(2);
    expect(fake.calls).toHaveLength(0);
  });

  it('fires a background train exactly once when the buffer hits batchSize', async () => {
    const fake = makeFakeReasoner();
    const onBatchTrained = vi.fn();
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: fake,
      toTrainingPair: project,
      batchSize: 3,
      onBatchTrained,
    });
    learner.score(outcome(0.1));
    learner.score(outcome(0.2));
    learner.score(outcome(0.3));
    // Train is scheduled; wait for it to settle.
    await learner.flush();

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.pairs).toHaveLength(3);
    expect(learner.bufferedCount()).toBe(0);
    expect(onBatchTrained).toHaveBeenCalledOnce();
    const batchResult = onBatchTrained.mock.calls[0]?.[0] as TrainResult | undefined;
    expect(typeof batchResult?.finalLoss).toBe('number');
  });

  it('skips outcomes whose projection returns null', () => {
    const fake = makeFakeReasoner();
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: fake,
      toTrainingPair: project,
      batchSize: 2,
    });
    learner.score(outcome(undefined));
    learner.score(outcome(0.5));
    expect(learner.bufferedCount()).toBe(1);
    expect(fake.calls).toHaveLength(0);
  });

  it('forwards trainSeed + epochs to the reasoner', async () => {
    const fake = makeFakeReasoner();
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: fake,
      toTrainingPair: project,
      batchSize: 2,
      epochs: 12,
      trainSeed: 42,
    });
    learner.score(outcome(0.1));
    learner.score(outcome(0.2));
    await learner.flush();

    expect(fake.calls[0]?.opts).toEqual({ epochs: 12, seed: 42 });
  });

  it('drops oldest buffered outcomes when bufferCapacity is exceeded', () => {
    const fake = makeFakeReasoner();
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: fake,
      toTrainingPair: project,
      batchSize: 10, // never auto-trains in this test
      bufferCapacity: 3,
    });
    for (let i = 0; i < 5; i++) learner.score(outcome(i / 10));

    expect(learner.bufferedCount()).toBe(3);
  });

  it('flush() trains the partial buffer immediately', async () => {
    const fake = makeFakeReasoner();
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: fake,
      toTrainingPair: project,
      batchSize: 10,
    });
    learner.score(outcome(0.1));
    learner.score(outcome(0.2));

    const result = await learner.flush();
    expect(result).not.toBeNull();
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.pairs).toHaveLength(2);
    expect(learner.bufferedCount()).toBe(0);
  });

  it('flush() returns null when the buffer is empty', async () => {
    const fake = makeFakeReasoner();
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: fake,
      toTrainingPair: project,
      batchSize: 5,
    });
    await expect(learner.flush()).resolves.toBeNull();
  });

  it('surfaces training errors via onTrainError (background) without throwing from score()', async () => {
    const errFake = {
      train(): Promise<TrainResult> {
        return Promise.reject(new Error('boom'));
      },
    };
    const onTrainError = vi.fn();
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: errFake,
      toTrainingPair: project,
      batchSize: 1,
      onTrainError,
    });
    learner.score(outcome(0.1));
    // Drain the microtask queue the background train scheduled.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onTrainError).toHaveBeenCalledOnce();
    expect((onTrainError.mock.calls[0]?.[0] as Error)?.message).toBe('boom');
    expect(learner.isTraining()).toBe(false);
  });

  it('drains queued batches after an in-flight train completes', async () => {
    let resolveFirst!: () => void;
    const firstBlocked = new Promise<void>((r) => {
      resolveFirst = r;
    });
    let callCount = 0;
    const slowFake: {
      calls: Array<{ pairs: Array<{ features: number[]; label: number[] }> }>;
      train: (
        pairs: ReadonlyArray<{ features: number[]; label: number[] }>,
      ) => Promise<TrainResult>;
    } = {
      calls: [],
      train(pairs) {
        const index = callCount++;
        slowFake.calls.push({
          pairs: pairs.map((p) => ({ features: [...p.features], label: [...p.label] })),
        });
        const gate = index === 0 ? firstBlocked : Promise.resolve();
        return gate.then(() => ({ finalLoss: 1 / pairs.length, history: { loss: [1, 0.5] } }));
      },
    };
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: slowFake,
      toTrainingPair: project,
      batchSize: 2,
    });

    // Fill the first batch; it starts training but stalls on firstBlocked.
    learner.score(outcome(0.1));
    learner.score(outcome(0.2));
    expect(learner.isTraining()).toBe(true);

    // Queue a second full batch while the first is still training.
    learner.score(outcome(0.3));
    learner.score(outcome(0.4));
    expect(slowFake.calls).toHaveLength(1);

    // Release the first batch; the tail should auto-schedule the second.
    resolveFirst();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(slowFake.calls).toHaveLength(2);
    expect(learner.bufferedCount()).toBe(0);
  });

  it('clamps non-positive bufferCapacity so the trim loop cannot hang', () => {
    const fake = makeFakeReasoner();
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: fake,
      toTrainingPair: project,
      batchSize: 10, // high enough that we never auto-train in this test
      bufferCapacity: -3,
    });

    // Before the clamp, `buffer.length > -3` stays true at length 0, so
    // `while (buffer.length > cap) buffer.shift()` spins forever.
    // After the clamp, cap is Math.max(0, -3) = 0, so each pushed pair
    // is immediately shifted back out and `score()` returns.
    learner.score(outcome(0.1));
    learner.score(outcome(0.2));

    expect(learner.bufferedCount()).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });

  it('clamps non-positive batchSize so runTrain cannot loop on zero-slice batches', async () => {
    const fake = makeFakeReasoner();
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: fake,
      toTrainingPair: project,
      batchSize: 0,
    });

    learner.score(outcome(0.1));
    // Clamped to 1 → the single outcome triggers a batch immediately.
    await learner.flush();

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.pairs).toHaveLength(1);
  });

  it('sanitises NaN batchSize / bufferCapacity to defaults', async () => {
    const fake = makeFakeReasoner();
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: fake,
      toTrainingPair: project,
      batchSize: Number.NaN,
      bufferCapacity: Number.NaN,
    });
    // Default batchSize=50, so one pair should buffer rather than
    // triggering an empty-batch training loop.
    learner.score(outcome(0.1));
    expect(learner.bufferedCount()).toBe(1);
    expect(fake.calls).toHaveLength(0);

    // flush() trains the single pair — and crucially doesn't hang.
    await learner.flush();
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.pairs).toHaveLength(1);
  });

  it('flush() marks isTraining() true while training and blocks concurrent batches', async () => {
    let resolveGate!: () => void;
    const gate = new Promise<void>((r) => {
      resolveGate = r;
    });
    const slowFake: {
      calls: number;
      train: (
        pairs: ReadonlyArray<{ features: number[]; label: number[] }>,
      ) => Promise<TrainResult>;
    } = {
      calls: 0,
      train(pairs) {
        slowFake.calls++;
        return gate.then(() => ({ finalLoss: 1 / pairs.length, history: { loss: [0.5] } }));
      },
    };
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: slowFake,
      toTrainingPair: project,
      batchSize: 10,
    });

    // Two pairs below the batchSize so auto-train never kicks in.
    learner.score(outcome(0.1));
    learner.score(outcome(0.2));

    const flushPromise = learner.flush();
    // Immediately after flush() starts, isTraining() must report true
    // and a concurrent burst that fills the buffer must NOT kick off a
    // second background train in parallel.
    expect(learner.isTraining()).toBe(true);
    for (let i = 0; i < 15; i++) learner.score(outcome(i / 100));
    expect(slowFake.calls).toBe(1);

    resolveGate();
    await flushPromise;
    // The drain-tail then picks up the queued batches.
    expect(slowFake.calls).toBeGreaterThan(1);
  });

  it('dispose() stops accepting new outcomes', () => {
    const fake = makeFakeReasoner();
    const learner = new TfjsLearner<number[], number[]>({
      reasoner: fake,
      toTrainingPair: project,
      batchSize: 1,
    });
    learner.dispose();
    learner.score(outcome(0.1));
    expect(learner.bufferedCount()).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });

  it('is deterministic: identical outcome sequences produce identical train() calls', async () => {
    const runOnce = async (): Promise<
      Array<{ pairs: Array<{ features: number[]; label: number[] }>; opts: TrainOptions }>
    > => {
      const fake = makeFakeReasoner();
      const learner = new TfjsLearner<number[], number[]>({
        reasoner: fake,
        toTrainingPair: project,
        batchSize: 2,
        epochs: 7,
        trainSeed: 9,
      });
      for (const r of [0.1, 0.2, 0.3, 0.4]) learner.score(outcome(r));
      await learner.flush();
      return fake.calls;
    };

    const runA = await runOnce();
    const runB = await runOnce();
    expect(runA).toEqual(runB);
  });
});
