import type { NeuralNetwork } from 'brain.js';
import { describe, expect, it, vi } from 'vitest';
import {
  BrainJsReasoner,
  type BrainJsNetworkData,
} from '../../../../src/cognition/adapters/brainjs/index.js';
import type { IntentionCandidate } from '../../../../src/cognition/IntentionCandidate.js';
import type { ReasonerContext } from '../../../../src/cognition/reasoning/Reasoner.js';
import { Modifiers } from '../../../../src/modifiers/Modifiers.js';

type NeedsLike = { list(): readonly { id: string; level: number }[] };

function ctx(
  candidates: readonly IntentionCandidate[],
  needs?: Record<string, number>,
): ReasonerContext {
  const needsLike: NeedsLike | undefined = needs
    ? {
        list: () => Object.entries(needs).map(([id, level]) => ({ id, level })),
      }
    : undefined;
  return {
    perceived: [],
    needs: needsLike as unknown as ReasonerContext['needs'],
    modifiers: new Modifiers(),
    candidates,
  };
}

/**
 * Minimal stand-in for a trained `brain.js` `NeuralNetwork`. The adapter
 * only calls `.run(input)` — nothing else — so tests exercise the full
 * code path without dragging the native `gpu.js` peer into the test
 * runtime.
 */
function stubNetwork<In extends BrainJsNetworkData, Out extends BrainJsNetworkData>(
  impl: (input: In) => Out,
): NeuralNetwork<In, Out> {
  return { run: impl } as unknown as NeuralNetwork<In, Out>;
}

describe('BrainJsReasoner', () => {
  it('returns null when interpret yields null', () => {
    const network = stubNetwork<number[], number[]>(() => [0.2]);
    const reasoner = new BrainJsReasoner({
      network,
      featuresOf: () => [0, 0],
      interpret: () => null,
    });
    expect(reasoner.selectIntention(ctx([]))).toBeNull();
  });

  it('passes features through network.run and returns the interpreted intention', () => {
    const run = vi.fn((input: number[]) => [input[0]! + input[1]!]);
    const network = stubNetwork<number[], number[]>(run);
    const reasoner = new BrainJsReasoner({
      network,
      featuresOf: () => [0.3, 0.7],
      interpret: (out) =>
        (out[0] ?? 0) > 0.5 ? { kind: 'satisfy', type: 'eat' } : { kind: 'idle', type: 'idle' },
    });

    expect(reasoner.selectIntention(ctx([]))).toEqual({ kind: 'satisfy', type: 'eat' });
    expect(run).toHaveBeenCalledWith([0.3, 0.7]);
  });

  it('exposes needsLevels so featuresOf can read the needs snapshot', () => {
    const network = stubNetwork<number[], number[]>((input) => [input[0]!]);
    const reasoner = new BrainJsReasoner({
      network,
      featuresOf: (_ctx, helpers) => {
        const levels = helpers.needsLevels();
        return [levels['hunger'] ?? 1, levels['energy'] ?? 1];
      },
      interpret: (out) =>
        (out[0] ?? 1) < 0.3 ? { kind: 'satisfy', type: 'satisfy-need:hunger' } : null,
    });

    expect(reasoner.selectIntention(ctx([], { hunger: 0.1, energy: 0.8 }))).toEqual({
      kind: 'satisfy',
      type: 'satisfy-need:hunger',
    });
    expect(reasoner.selectIntention(ctx([], { hunger: 0.9, energy: 0.8 }))).toBeNull();
  });

  it('returns {} from needsLevels when ctx.needs is undefined', () => {
    const network = stubNetwork<number[], number[]>(() => [0]);
    const reasoner = new BrainJsReasoner({
      network,
      featuresOf: (_ctx, helpers) => {
        expect(helpers.needsLevels()).toEqual({});
        return [0];
      },
      interpret: () => null,
    });
    reasoner.selectIntention(ctx([]));
  });

  it('lets interpret pick the highest-scoring candidate via topCandidate', () => {
    const candidates: IntentionCandidate[] = [
      { intention: { kind: 'satisfy', type: 'satisfy-need:hunger' }, score: 0.6, source: 'needs' },
      { intention: { kind: 'satisfy', type: 'satisfy-need:energy' }, score: 0.9, source: 'needs' },
    ];
    const network = stubNetwork<number[], number[]>(() => [1]);
    const reasoner = new BrainJsReasoner({
      network,
      featuresOf: () => [0],
      interpret: (out, _ctx, helpers) => {
        if ((out[0] ?? 0) < 0.5) return null;
        const top = helpers.topCandidate();
        return top ? top.intention : null;
      },
    });

    expect(reasoner.selectIntention(ctx(candidates))).toEqual({
      kind: 'satisfy',
      type: 'satisfy-need:energy',
    });
  });

  it('topCandidate applies the filter and returns null when no candidate matches', () => {
    const candidates: IntentionCandidate[] = [
      { intention: { kind: 'satisfy', type: 'satisfy-need:hunger' }, score: 0.6, source: 'needs' },
    ];
    const network = stubNetwork<number[], number[]>(() => [0]);
    const reasoner = new BrainJsReasoner({
      network,
      featuresOf: () => [0],
      interpret: (_out, _ctx, helpers) => {
        const top = helpers.topCandidate((c) => c.intention.type === 'satisfy-need:energy');
        return top ? top.intention : null;
      },
    });
    expect(reasoner.selectIntention(ctx(candidates))).toBeNull();
  });

  it('getNetwork returns the underlying network instance', () => {
    const network = stubNetwork<number[], number[]>(() => [0]);
    const reasoner = new BrainJsReasoner({
      network,
      featuresOf: () => [0],
      interpret: () => null,
    });
    expect(reasoner.getNetwork()).toBe(network);
  });

  it('is deterministic: identical input produces identical output', () => {
    // Stub that mimics a pure forward pass — no hidden state.
    const network = stubNetwork<number[], number[]>((input) => [input[0]! * 2 + input[1]!]);
    const reasoner = new BrainJsReasoner({
      network,
      featuresOf: (_ctx, helpers) => [helpers.needsLevels()['hunger'] ?? 0, 0.5],
      interpret: (out) => ({ kind: 'satisfy', type: 'eat', params: { score: out[0] ?? 0 } }),
    });

    const a = reasoner.selectIntention(ctx([], { hunger: 0.4 }));
    const b = reasoner.selectIntention(ctx([], { hunger: 0.4 }));
    expect(a).toEqual(b);
  });
});
