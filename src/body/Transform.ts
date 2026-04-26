/**
 * Minimal 3D transform used to place an agent in the world. Values are plain
 * numbers — no math libraries, no physics. Renderers and hosts can interpret
 * units however they like (pixels, world-units, tiles).
 */
export type Vector3Like = {
  x: number;
  y: number;
  z: number;
};

/**
 * Spatial pose of an embodied agent.
 *
 * - `position` — world-space coordinates.
 * - `rotation` — Euler angles in radians (x, y, z order is host-defined).
 * - `scale`    — per-axis scale factors; `1` means "natural size".
 */
export type Transform = {
  position: Vector3Like;
  rotation: Vector3Like;
  scale: Vector3Like;
};

/** Zero position, zero rotation, unit scale. Always returns a fresh object. */
export function identityTransform(): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

/**
 * Pure translate helper. Returns a new `Transform` with `position` shifted by
 * `(dx, dy, dz)`. The input is never mutated; `rotation` and `scale` are
 * copied shallowly.
 */
export function translate(t: Transform, dx: number, dy: number, dz = 0): Transform {
  return {
    position: {
      x: t.position.x + dx,
      y: t.position.y + dy,
      z: t.position.z + dz,
    },
    rotation: { ...t.rotation },
    scale: { ...t.scale },
  };
}
