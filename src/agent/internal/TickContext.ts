/**
 * Shared tick-time context passed between the `Agent.tick()` stages.
 *
 * Internal module — not re-exported from the library barrel.
 *
 * @internal
 */
export type TickContext = {
  /** Wall-clock time at the start of the tick, in ms. */
  readonly tickStartedAt: number;
  /** Virtual seconds of dt after applying `timeScale`. */
  readonly virtualDtSeconds: number;
};
