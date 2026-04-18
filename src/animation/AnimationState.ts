/**
 * Visual animation state, separate from `LifeStage`. Drives the renderer;
 * the agent's cognition layer doesn't care about these values directly.
 *
 * Common values are typed for IntelliSense; consumers extend via the
 * string-escape hatch (`'surfing'`, `'hugging'`, …).
 */
export type AnimationState =
  | 'idle'
  | 'eating'
  | 'sleeping'
  | 'playing'
  | 'sick'
  | 'sad'
  | 'happy'
  | 'sulking'
  | 'dead'
  | (string & {});
