import { describe, expect, it } from 'vitest';
import { type Appearance, defaultAppearance } from '../../../src/body/Appearance.js';

describe('Appearance', () => {
  it('defaultAppearance produces a visible 32x32 white rectangle', () => {
    const a = defaultAppearance();
    expect(a.shape).toBe('rectangle');
    expect(a.width).toBe(32);
    expect(a.height).toBe(32);
    expect(a.color).toBe('#ffffff');
    expect(a.visible).toBe(true);
  });

  it('defaultAppearance omits optional fields', () => {
    const a = defaultAppearance();
    expect(a.spriteId).toBeUndefined();
    expect(a.layer).toBeUndefined();
  });

  it('defaultAppearance returns a fresh object each call', () => {
    expect(defaultAppearance()).not.toBe(defaultAppearance());
  });

  it('supports the spread-override pattern', () => {
    const overridden: Appearance = {
      ...defaultAppearance(),
      shape: 'circle',
      color: '#ff00ff',
      width: 48,
      spriteId: 'hero.idle',
      layer: 10,
    };
    expect(overridden.shape).toBe('circle');
    expect(overridden.color).toBe('#ff00ff');
    expect(overridden.width).toBe(48);
    expect(overridden.height).toBe(32); // unchanged
    expect(overridden.visible).toBe(true);
    expect(overridden.spriteId).toBe('hero.idle');
    expect(overridden.layer).toBe(10);
  });
});
