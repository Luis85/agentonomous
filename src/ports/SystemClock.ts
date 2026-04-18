// This adapter is the single legal `Date` user in the library; the matching
// ESLint override in eslint.config.js turns off `no-restricted-globals` here.
import type { WallClock } from './WallClock.js';

/** Production `WallClock` backed by `Date.now()`. */
export class SystemClock implements WallClock {
  now(): number {
    return Date.now();
  }
}
