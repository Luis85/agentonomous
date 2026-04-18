import type { WallClock } from './WallClock.js';

/**
 * Deterministic `WallClock` for tests. Time advances only when the caller
 * invokes `advance(dtMs)` or `set(ms)`. Never reads the real clock.
 */
export class ManualClock implements WallClock {
  private current: number;

  constructor(initialMs = 0) {
    this.current = initialMs;
  }

  now(): number {
    return this.current;
  }

  /** Step the clock forward by `dtMs` milliseconds. */
  advance(dtMs: number): void {
    if (dtMs < 0) {
      throw new RangeError(`ManualClock.advance requires non-negative dt; got ${dtMs}`);
    }
    this.current += dtMs;
  }

  /** Jump to an absolute millisecond value. May move backward (useful for fixture replay). */
  set(ms: number): void {
    this.current = ms;
  }
}
