/**
 * Minimal, runtime-agnostic interfaces matching the Excalibur surface this
 * integration actually touches. Consumers pass real `ex.Actor` / `ex.Engine`
 * instances at runtime; tests inject stubs.
 *
 * Keeping these types here (rather than importing from `'excalibur'`) means
 * the integration module stays loadable under Node at test time without
 * Excalibur's `window` polyfill exploding.
 */

/** Subset of `ex.Vector` used for position syncing. */
export type Vector2Like = {
  x: number;
  y: number;
};

/** Subset of `ex.Actor` used for sprite syncing and graphic swaps. */
export type ActorLike = {
  pos: Vector2Like;
  rotation: number;
  scale: Vector2Like;
  graphics: {
    use(nameOrGraphic: unknown): void;
  };
};

/**
 * Keyboard+pointer state abstraction. The real Excalibur engine satisfies
 * this shape once wrapped — see `ExcaliburRemoteController.fromEngine`.
 */
export type InputSourceLike = {
  /** Snapshot the currently-pressed keys. */
  keysPressed(): readonly string[];
  /** Snapshot queued clicks since the last call, or `[]`. */
  clicksSince(): readonly { x: number; y: number; button: 'left' | 'right' | 'middle' }[];
};
