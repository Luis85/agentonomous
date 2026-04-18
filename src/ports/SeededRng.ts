// RNG internals use bitwise hashing primitives; the matching ESLint override in
// eslint.config.js relaxes the determinism lint rules for this adapter.
import type { Rng } from './Rng.js';

/**
 * Deterministic PRNG based on the SFC32 algorithm (small-fast-counter).
 * Period ≈ 2^128, excellent statistical quality for simulation workloads,
 * and the implementation is a tight ~8 lines.
 *
 * Reference: Chris Doty-Humphrey's PractRand suite author.
 */
export class SeededRng implements Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number | string = 0) {
    const hashed = hashSeed(seed);
    this.a = hashed[0];
    this.b = hashed[1];
    this.c = hashed[2];
    this.d = hashed[3];
    // Warm up the state so close seeds diverge quickly.
    for (let i = 0; i < 16; i++) this.next();
  }

  next(): number {
    let { a, b, c, d } = this;
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    return (t >>> 0) / 4_294_967_296;
  }

  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new TypeError('Rng.int requires integer bounds');
    }
    if (max < min) {
      throw new RangeError(`Rng.int: max (${max}) must be >= min (${min})`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('Rng.pick requires a non-empty array');
    }
    const value = items[this.int(0, items.length - 1)];
    // Non-null assertion is safe: int() returns a valid in-range index.
    return value as T;
  }
}

/**
 * Derive a 128-bit state tuple from an arbitrary seed (number or string).
 * Uses the xmur3 hash (same family as sfc32) for stable cross-run seeds.
 */
function hashSeed(seed: number | string): [number, number, number, number] {
  const str = typeof seed === 'number' ? String(seed >>> 0) : seed;
  let h = 1_779_033_703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3_432_918_353);
    h = (h << 13) | (h >>> 19);
  }
  const step = (): number => {
    h = Math.imul(h ^ (h >>> 16), 2_246_822_507);
    h = Math.imul(h ^ (h >>> 13), 3_266_489_909);
    h ^= h >>> 16;
    return h >>> 0;
  };
  return [step(), step(), step(), step()];
}
