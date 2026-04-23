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
});
