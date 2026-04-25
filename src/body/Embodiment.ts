import { type Appearance, defaultAppearance } from './Appearance.js';
import { type LocomotionMode } from './LocomotionMode.js';
import { identityTransform, type Transform } from './Transform.js';

/**
 * An agent's body. Bundles spatial pose, visual description, and locomotion
 * style. Deliberately minimal — no physics, no collision, no animation state.
 * Hosts add those concerns on top.
 */
export type Embodiment = {
  transform: Transform;
  appearance: Appearance;
  locomotion: LocomotionMode;
};

/**
 * Build an `Embodiment` with sensible defaults, optionally overriding any
 * subset of its fields. Always returns a fresh object; nested defaults are
 * also freshly constructed so callers can mutate freely.
 */
export function defaultEmbodiment(overrides: Partial<Embodiment> = {}): Embodiment {
  return {
    transform: identityTransform(),
    appearance: defaultAppearance(),
    locomotion: 'static',
    ...overrides,
  };
}
