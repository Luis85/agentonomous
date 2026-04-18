import { describe, expect, it } from 'vitest';
import { andThen, err, isErr, isOk, map, mapErr, ok, unwrap } from '../../../src/agent/result.js';

describe('Result<T, E>', () => {
  it('ok() and err() construct the right shape', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
    expect(err('boom')).toEqual({ ok: false, error: 'boom' });
  });

  it('isOk / isErr discriminate correctly', () => {
    const good = ok(1);
    const bad = err('e');
    expect(isOk(good)).toBe(true);
    expect(isErr(good)).toBe(false);
    expect(isOk(bad)).toBe(false);
    expect(isErr(bad)).toBe(true);
  });

  it('map transforms Ok and passes through Err', () => {
    expect(map(ok(3), (n) => n * 2)).toEqual(ok(6));
    expect(map(err<string>('e'), (n: number) => n * 2)).toEqual(err('e'));
  });

  it('mapErr transforms Err and passes through Ok', () => {
    expect(mapErr(err('e'), (s) => s.toUpperCase())).toEqual(err('E'));
    expect(mapErr(ok(3), (s: string) => s.toUpperCase())).toEqual(ok(3));
  });

  it('andThen chains Result-returning fns', () => {
    const divide = (num: number, den: number) => (den === 0 ? err('div-by-zero') : ok(num / den));
    expect(andThen(ok(10), (n) => divide(n, 2))).toEqual(ok(5));
    expect(andThen(ok(10), (n) => divide(n, 0))).toEqual(err('div-by-zero'));
    expect(andThen(err('prior'), (n: number) => divide(n, 2))).toEqual(err('prior'));
  });

  it('unwrap returns the value for Ok and throws for Err', () => {
    expect(unwrap(ok(1))).toBe(1);
    expect(() => unwrap(err('boom'))).toThrow(/boom/);
    expect(() => unwrap(err('x'), 'custom message')).toThrow('custom message');
  });
});
