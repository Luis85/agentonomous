/**
 * Source of wall-clock time in milliseconds.
 *
 * All library code reads wall time through this port rather than touching
 * the global `Date` — that's the seam that keeps ticks deterministic under
 * `ManualClock` in tests.
 */
export type WallClock = {
  /** Current wall time in milliseconds (UNIX epoch compatible). */
  now(): number;
};
