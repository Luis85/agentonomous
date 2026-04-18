import { describe, expect, it } from 'vitest';
import { identityTransform, translate } from '../../../src/body/Transform.js';

describe('Transform', () => {
  it('identity has zero position, zero rotation, unit scale', () => {
    const t = identityTransform();
    expect(t.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(t.rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(t.scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('identity returns a fresh object each call', () => {
    const a = identityTransform();
    const b = identityTransform();
    expect(a).not.toBe(b);
    expect(a.position).not.toBe(b.position);
  });

  it('translate returns a new Transform and leaves the original unchanged', () => {
    const original = identityTransform();
    const moved = translate(original, 5, -3, 2);

    expect(moved).not.toBe(original);
    expect(moved.position).toEqual({ x: 5, y: -3, z: 2 });
    expect(original.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('translate defaults dz to 0', () => {
    const moved = translate(identityTransform(), 1, 2);
    expect(moved.position).toEqual({ x: 1, y: 2, z: 0 });
  });

  it('translate is additive across calls', () => {
    const a = translate(identityTransform(), 1, 2, 3);
    const b = translate(a, 4, 5, 6);
    expect(b.position).toEqual({ x: 5, y: 7, z: 9 });
    expect(a.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('translate does not alias rotation or scale with the input', () => {
    const original = identityTransform();
    const moved = translate(original, 0, 0);
    expect(moved.rotation).not.toBe(original.rotation);
    expect(moved.scale).not.toBe(original.scale);
    expect(moved.rotation).toEqual(original.rotation);
    expect(moved.scale).toEqual(original.scale);
  });
});
