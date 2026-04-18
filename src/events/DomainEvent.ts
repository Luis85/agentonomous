/**
 * Base shape of every event on the `EventBusPort`.
 *
 * Concrete event types (e.g., `NeedCritical`, `ModifierApplied`,
 * `LifeStageChanged`) extend this interface and set a string-literal `type`.
 * The `fxHint` field is an optional decoration renderers consume to trigger
 * sound/particle/camera effects — see the plan's FX hints refinement.
 */
export interface DomainEvent {
  /** Discriminator. Concrete events set this as a string literal. */
  type: string;
  /** Wall-clock ms at which the event was created; populated by publishers. */
  at: number;
  /** Id of the agent the event pertains to; omitted for world-scoped events. */
  agentId?: string;
  /** Optional hint for renderers (`'sparkle-blue'`, `'sad-cloud'`, etc.). */
  fxHint?: string;
  /** Free-form payload for concrete event types to extend. */
  [extra: string]: unknown;
}
