import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../../src/ports/ManualClock.js';

describe('ManualClock', () => {
  it('defaults to t=0', () => {
    const clock = new ManualClock();
    expect(clock.now()).toBe(0);
  });

  it('honors an initial value', () => {
    const clock = new ManualClock(1_700_000_000_000);
    expect(clock.now()).toBe(1_700_000_000_000);
  });

  it('advances monotonically', () => {
    const clock = new ManualClock();
    clock.advance(500);
    expect(clock.now()).toBe(500);
    clock.advance(250);
    expect(clock.now()).toBe(750);
  });

  it('rejects negative advance', () => {
    const clock = new ManualClock();
    expect(() => clock.advance(-1)).toThrow(RangeError);
  });

  it('supports set() (including backward jumps)', () => {
    const clock = new ManualClock(1_000);
    clock.set(42);
    expect(clock.now()).toBe(42);
  });
});
