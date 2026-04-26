/**
 * Shape hint for simple renderers. The `(string & {})` escape hatch lets
 * hosts declare custom shapes (e.g. `'hexagon'`, `'capsule'`) without
 * patching the library.
 */
export type AgentShape = 'rectangle' | 'circle' | 'sprite' | (string & {});

/**
 * Visual description of an agent. Just enough to drive a 2D sprite or a
 * placeholder primitive — no textures, materials, or animation state.
 */
export type Appearance = {
  shape: AgentShape;
  /** Width in renderer units (pixels for 2D, world-units for 3D). */
  width: number;
  /** Height in renderer units. */
  height: number;
  /** CSS color string — e.g. `'#ffffff'`, `'rgb(255, 0, 0)'`, `'tomato'`. */
  color: string;
  /** When `false`, renderers should skip drawing this agent. */
  visible: boolean;
  /** Resource key for sprite renderers. Ignored for primitive shapes. */
  spriteId?: string;
  /** Z-order hint; larger values render on top. */
  layer?: number;
};

/** Sensible defaults: a visible 32x32 white rectangle. Always a fresh object. */
export function defaultAppearance(): Appearance {
  return {
    shape: 'rectangle',
    width: 32,
    height: 32,
    color: '#ffffff',
    visible: true,
  };
}
