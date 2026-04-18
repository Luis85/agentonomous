import { describe, expect, it } from 'vitest';
import { SystemClock } from '../../../src/ports/SystemClock.js';

describe('SystemClock', () => {
  it('returns wall-clock milliseconds', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
