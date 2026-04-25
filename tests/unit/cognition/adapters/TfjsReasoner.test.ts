import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs-core';
import { layers, sequential, type Sequential } from '@tensorflow/tfjs-layers';
import { beforeAll, describe, expect, it } from 'vitest';
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

function makeLinearModel(): Sequential {
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

function makeInferenceOnlyModel(): Sequential {
  return sequential({
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
      { intention: { kind: 'satisfy', type: 'eat' }, score: 0.9, source: 'needs' },
      { intention: { kind: 'satisfy', type: 'rest' }, score: 0.2, source: 'needs' },
    ];
    const model = makeLinearModel();
    const reasoner = new TfjsReasoner({
      model,
      featuresOf: () => [1, 0],
      interpret: (_out, _ctx, helpers) => helpers.topCandidate()?.intention ?? null,
    });
    const picked = reasoner.selectIntention(ctx(candidates));
    expect(picked).not.toBeNull();
    expect(picked?.type).toBe('eat');
    reasoner.dispose();
  });

  it('two back-to-back selectIntention calls produce identical output (deterministic inference)', () => {
    const model = makeLinearModel();
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
    expect(second).toBe(first);
    expect(first!).toBeCloseTo(2.1, 5);
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
    // Uncompiled model — a compiled optimizer holds a persistent lr scalar
    // outside the reasoner's ownership, so we keep this test focused on
    // the model-tensor lifecycle the adapter actually controls.
    {
      const model = makeInferenceOnlyModel();
      const r = new TfjsReasoner({ model, featuresOf: () => [0, 0], interpret: () => null });
      r.selectIntention(ctx());
      r.dispose();
    }
    const baseline = tf.memory().numTensors;
    for (let i = 0; i < 10; i++) {
      const model = makeInferenceOnlyModel();
      const r = new TfjsReasoner({ model, featuresOf: () => [0, 0], interpret: () => null });
      r.selectIntention(ctx());
      r.dispose();
    }
    const after = tf.memory().numTensors;
    expect(after - baseline).toBeLessThanOrEqual(5);
  });

  it('TfjsBackendNotRegisteredError carries requestedBackend and suggestedPackage', () => {
    const err = new TfjsBackendNotRegisteredError('wasm');
    expect(err.requestedBackend).toBe('wasm');
    expect(err.suggestedPackage).toBe('@tensorflow/tfjs-backend-wasm');
    expect(err.message).toMatch(/tfjs-backend-wasm/);
  });

  it('selectIntention throws a typed error when featuresOf returns an object map', () => {
    const model = makeInferenceOnlyModel();
    const reasoner = new TfjsReasoner<Record<string, number>, number[]>({
      model,
      // Simulates a naïve brain.js migration where features is Record<string,number>.
      featuresOf: () => ({ hunger: 1, cleanliness: 0 }),
      interpret: () => null,
    });
    expect(() => reasoner.selectIntention(ctx())).toThrow(TypeError);
    expect(() => reasoner.selectIntention(ctx())).toThrow(/brain\.js|Object\.values|TypedArray/);
    reasoner.dispose();
  });

  it('selectIntention does not leak input tensors when featuresOf returns a tf.Tensor', () => {
    const model = makeInferenceOnlyModel();
    const reasoner = new TfjsReasoner({
      model,
      featuresOf: () => tf.tensor2d([[0.5, 0.5]]),
      interpret: () => null,
    });
    reasoner.selectIntention(ctx()); // warm-up to settle tfjs caches
    const before = tf.memory().numTensors;
    for (let i = 0; i < 20; i++) reasoner.selectIntention(ctx());
    const after = tf.memory().numTensors;
    expect(after - before).toBeLessThanOrEqual(2);
    reasoner.dispose();
  });
});

describe('TfjsReasoner — training', () => {
  function makeConvergingPairs(): Array<{ features: number[]; label: number[] }> {
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
    const r1 = new TfjsReasoner({
      model: model1,
      featuresOf: () => [0, 0],
      interpret: () => null,
    });
    const result1 = await r1.train(pairs, { epochs: 50, learningRate: 0.1, seed: 7 });

    const model2 = makeLinearModel();
    const r2 = new TfjsReasoner({
      model: model2,
      featuresOf: () => [0, 0],
      interpret: () => null,
    });
    const result2 = await r2.train(pairs, { epochs: 50, learningRate: 0.1, seed: 7 });

    expect(result1.finalLoss).toBeCloseTo(result2.finalLoss, 3);
    r1.dispose();
    r2.dispose();
  });

  it('train with fixed seed yields reproducible per-epoch loss trajectories', async () => {
    const pairs = makeConvergingPairs();
    const m1 = makeLinearModel();
    const r1 = new TfjsReasoner({ model: m1, featuresOf: () => [0, 0], interpret: () => null });
    const h1 = await r1.train(pairs, { epochs: 20, learningRate: 0.1, seed: 1 });
    const m2 = makeLinearModel();
    const r2 = new TfjsReasoner({ model: m2, featuresOf: () => [0, 0], interpret: () => null });
    const h2 = await r2.train(pairs, { epochs: 20, learningRate: 0.1, seed: 1 });
    for (let i = 0; i < h1.history.loss.length; i++) {
      expect(h1.history.loss[i]!).toBeCloseTo(h2.history.loss[i]!, 3);
    }
    r1.dispose();
    r2.dispose();
  });

  it('onEpochEnd fires once per epoch with monotonic 0-indexed epoch + numeric loss', async () => {
    const pairs = makeConvergingPairs();
    const r = new TfjsReasoner({
      model: makeLinearModel(),
      featuresOf: () => [0, 0],
      interpret: () => null,
    });
    const calls: Array<{ epoch: number; loss: number }> = [];
    const result = await r.train(pairs, {
      epochs: 5,
      learningRate: 0.1,
      seed: 42,
      onEpochEnd: (epoch, loss) => {
        calls.push({ epoch, loss });
      },
    });
    expect(calls).toHaveLength(5);
    expect(calls.map((c) => c.epoch)).toEqual([0, 1, 2, 3, 4]);
    for (const c of calls) expect(Number.isFinite(c.loss)).toBe(true);
    // Last callback's loss matches the result's final loss exactly.
    expect(calls[4]!.loss).toBeCloseTo(result.finalLoss, 5);
    r.dispose();
  });

  it('train without onEpochEnd does not throw (callback is optional)', async () => {
    const r = new TfjsReasoner({
      model: makeLinearModel(),
      featuresOf: () => [0, 0],
      interpret: () => null,
    });
    await expect(
      r.train(makeConvergingPairs(), { epochs: 2, learningRate: 0.1, seed: 0 }),
    ).resolves.toBeDefined();
    r.dispose();
  });
});

describe('TfjsReasoner — persistence', () => {
  it('toJSON → fromJSON round-trip produces identical selectIntention output', async () => {
    const model1 = makeLinearModel();
    const [dense1] = model1.layers;
    dense1!.setWeights([tf.tensor2d([[0.3], [-0.4]]), tf.tensor1d([0.05])]);

    const captureOut =
      (bag: { v: number | null }) =>
      (out: number[]): null => {
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

    expect(bag2.v).toBeCloseTo(bag1.v!, 5);
    r1.dispose();
    r2.dispose();
  });

  it('fromJSON rejects a corrupted snapshot with a clear error', async () => {
    const bogus = {
      version: 1 as const,
      topology: { garbage: true },
      weights: '',
      weightsShapes: [[5, 1], [1]] as readonly (readonly number[])[],
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

    const r2 = await TfjsReasoner.fromJSON(snapshot, {
      featuresOf: () => [0, 0],
      interpret: () => null,
    });
    expect(r2.getModel()).toBeDefined();
    r2.dispose();
  });
});

describe('TfjsReasoner — bundled demo baseline', () => {
  it('learning.network.json loads and produces sigmoid(-1) ≈ 0.2689 for hunger=1', async () => {
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

    expect(captured).not.toBeNull();
    expect(captured!).toBeCloseTo(0.2689, 4);
    reasoner.dispose();
  });
});
