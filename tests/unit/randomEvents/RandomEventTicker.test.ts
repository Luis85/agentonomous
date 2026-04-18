import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../../src/events/DomainEvent.js';
import { Modifiers } from '../../../src/modifiers/Modifiers.js';
import { SeededRng } from '../../../src/ports/SeededRng.js';
import { defineRandomEvent } from '../../../src/randomEvents/defineRandomEvent.js';
import {
  RandomEventTicker,
  type RandomEventTickOptions,
} from '../../../src/randomEvents/RandomEventTicker.js';

function baseOpts(overrides: Partial<RandomEventTickOptions> = {}): RandomEventTickOptions {
  return {
    virtualDtSeconds: 1,
    virtualNowSeconds: 0,
    rng: new SeededRng('fixed'),
    needs: undefined,
    modifiers: new Modifiers(),
    stage: undefined,
    ...overrides,
  };
}

describe('RandomEventTicker', () => {
  it('produces identical event streams under the same seed', () => {
    const makeDefs = () => [
      defineRandomEvent({
        id: 'a',
        probabilityPerSecond: 0.3,
        emit: () => ({ type: 'A', at: 0 }),
      }),
      defineRandomEvent({
        id: 'b',
        probabilityPerSecond: 0.7,
        emit: () => ({ type: 'B', at: 0 }),
      }),
    ];

    const tickerA = new RandomEventTicker(makeDefs());
    const tickerB = new RandomEventTicker(makeDefs());
    const rngA = new SeededRng('fixed');
    const rngB = new SeededRng('fixed');
    const modsA = new Modifiers();
    const modsB = new Modifiers();

    const streamA: string[] = [];
    const streamB: string[] = [];

    for (let i = 0; i < 50; i++) {
      const nowSeconds = i * 1;
      const batchA = tickerA.tick({
        virtualDtSeconds: 1,
        virtualNowSeconds: nowSeconds,
        rng: rngA,
        needs: undefined,
        modifiers: modsA,
        stage: undefined,
      });
      const batchB = tickerB.tick({
        virtualDtSeconds: 1,
        virtualNowSeconds: nowSeconds,
        rng: rngB,
        needs: undefined,
        modifiers: modsB,
        stage: undefined,
      });
      streamA.push(...batchA.map((e) => e.type));
      streamB.push(...batchB.map((e) => e.type));
    }

    expect(streamA).toEqual(streamB);
    // Smoke check that something actually fired, otherwise the test is vacuous.
    expect(streamA.length).toBeGreaterThan(0);
  });

  it('probabilityPerSecond: 1 always fires when cooldown permits', () => {
    const ticker = new RandomEventTicker([
      defineRandomEvent({
        id: 'certain',
        probabilityPerSecond: 1,
        emit: () => ({ type: 'Certain', at: 0 }),
      }),
    ]);

    const events: DomainEvent[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(...ticker.tick(baseOpts({ virtualNowSeconds: i })));
    }
    expect(events).toHaveLength(10);
    expect(events.every((e) => e.type === 'Certain')).toBe(true);
  });

  it('probabilityPerSecond: 0 never fires', () => {
    const ticker = new RandomEventTicker([
      defineRandomEvent({
        id: 'never',
        probabilityPerSecond: 0,
        emit: () => ({ type: 'Never', at: 0 }),
      }),
    ]);

    const events: DomainEvent[] = [];
    for (let i = 0; i < 100; i++) {
      events.push(...ticker.tick(baseOpts({ virtualNowSeconds: i })));
    }
    expect(events).toEqual([]);
  });

  it('cooldownSeconds gates re-fires until virtualNowSeconds advances past it', () => {
    const ticker = new RandomEventTicker([
      defineRandomEvent({
        id: 'chatty',
        probabilityPerSecond: 1,
        cooldownSeconds: 5,
        emit: () => ({ type: 'Chatty', at: 0 }),
      }),
    ]);

    // Tick 0s: fires.
    expect(ticker.tick(baseOpts({ virtualNowSeconds: 0 }))).toHaveLength(1);
    // Tick 1s through 5s: cooldown blocks (last fired at 0 + 5 = 5 > nowSeconds).
    for (let t = 1; t <= 4; t++) {
      expect(ticker.tick(baseOpts({ virtualNowSeconds: t }))).toHaveLength(0);
    }
    // At t=5, last + cooldown = 5, and the guard is strict >, so the event fires again.
    expect(ticker.tick(baseOpts({ virtualNowSeconds: 5 }))).toHaveLength(1);
    // Cooldown re-arms from t=5.
    expect(ticker.tick(baseOpts({ virtualNowSeconds: 6 }))).toHaveLength(0);
    expect(ticker.tick(baseOpts({ virtualNowSeconds: 10 }))).toHaveLength(1);
  });

  it('guard returning false suppresses the event', () => {
    const ticker = new RandomEventTicker([
      defineRandomEvent({
        id: 'blocked',
        probabilityPerSecond: 1,
        guard: () => false,
        emit: () => ({ type: 'Blocked', at: 0 }),
      }),
    ]);

    const events: DomainEvent[] = [];
    for (let i = 0; i < 20; i++) {
      events.push(...ticker.tick(baseOpts({ virtualNowSeconds: i })));
    }
    expect(events).toEqual([]);
  });

  it('scales probability as 1 - (1 - p) ** dt (approx 0.9375 for p=0.5, dt=4)', () => {
    // Stub RNG that records the exact probability fed to chance().
    const observed: number[] = [];
    const stubRng = {
      next: () => 0,
      int: () => 0,
      chance: (p: number) => {
        observed.push(p);
        return false;
      },
      pick: <T>(items: readonly T[]): T => items[0] as T,
    };

    const ticker = new RandomEventTicker([
      defineRandomEvent({
        id: 'scaled',
        probabilityPerSecond: 0.5,
        emit: () => ({ type: 'Scaled', at: 0 }),
      }),
    ]);

    ticker.tick({
      virtualDtSeconds: 4,
      virtualNowSeconds: 0,
      rng: stubRng,
      needs: undefined,
      modifiers: new Modifiers(),
      stage: undefined,
    });

    expect(observed).toHaveLength(1);
    expect(observed[0]).toBeCloseTo(0.9375, 6);
  });

  it('list() exposes defs in registration order; register() appends', () => {
    const ticker = new RandomEventTicker([
      defineRandomEvent({ id: 'one', probabilityPerSecond: 0, emit: () => ({ type: '1', at: 0 }) }),
    ]);
    ticker.register(
      defineRandomEvent({ id: 'two', probabilityPerSecond: 0, emit: () => ({ type: '2', at: 0 }) }),
    );
    expect(ticker.list().map((d) => d.id)).toEqual(['one', 'two']);
  });

  it('returns an empty list when virtualDtSeconds <= 0', () => {
    const ticker = new RandomEventTicker([
      defineRandomEvent({
        id: 'always',
        probabilityPerSecond: 1,
        emit: () => ({ type: 'Always', at: 0 }),
      }),
    ]);
    expect(ticker.tick(baseOpts({ virtualDtSeconds: 0 }))).toEqual([]);
    expect(ticker.tick(baseOpts({ virtualDtSeconds: -1 }))).toEqual([]);
  });
});
