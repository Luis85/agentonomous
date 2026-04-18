import { describe, expect, it } from 'vitest';
import { defaultEmbodiment } from '../../../src/body/Embodiment.js';

describe('Embodiment', () => {
  it('defaultEmbodiment fills sensible values', () => {
    const e = defaultEmbodiment();
    expect(e.transform.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(e.transform.rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(e.transform.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(e.appearance.shape).toBe('rectangle');
    expect(e.appearance.color).toBe('#ffffff');
    expect(e.appearance.visible).toBe(true);
    expect(e.locomotion).toBe('static');
  });

  it('returns a fresh object with fresh nested defaults', () => {
    const a = defaultEmbodiment();
    const b = defaultEmbodiment();
    expect(a).not.toBe(b);
    expect(a.transform).not.toBe(b.transform);
    expect(a.appearance).not.toBe(b.appearance);
  });

  it('applies override spread for top-level fields', () => {
    const e = defaultEmbodiment({ locomotion: 'fly' });
    expect(e.locomotion).toBe('fly');
    expect(e.appearance.shape).toBe('rectangle');
  });

  it('lets callers fully replace nested slots via overrides', () => {
    const e = defaultEmbodiment({
      transform: {
        position: { x: 10, y: 20, z: 30 },
        rotation: { x: 0, y: Math.PI, z: 0 },
        scale: { x: 2, y: 2, z: 2 },
      },
      appearance: {
        shape: 'sprite',
        width: 64,
        height: 64,
        color: '#000000',
        visible: true,
        spriteId: 'npc.guard',
      },
      locomotion: 'walk',
    });

    expect(e.transform.position).toEqual({ x: 10, y: 20, z: 30 });
    expect(e.transform.scale).toEqual({ x: 2, y: 2, z: 2 });
    expect(e.appearance.shape).toBe('sprite');
    expect(e.appearance.spriteId).toBe('npc.guard');
    expect(e.locomotion).toBe('walk');
  });

  it('accepts custom locomotion strings via the (string & {}) escape hatch', () => {
    const e = defaultEmbodiment({ locomotion: 'teleport' });
    expect(e.locomotion).toBe('teleport');
  });
});
