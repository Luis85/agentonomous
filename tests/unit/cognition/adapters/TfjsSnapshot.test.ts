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
    expect(Array.from(decoded[0]!)).toEqual([
      -1,
      new Float32Array([-0.8])[0],
      new Float32Array([-0.6])[0],
      new Float32Array([-0.7])[0],
      new Float32Array([-0.9])[0],
      0,
    ]);
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
    const weights = [
      new Float32Array([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0]),
    ];
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
    expect(() => decodeWeights(encoded, [[5]])).toThrow(/shape|payload/i);
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
