import type { DomainEvent } from '../events/DomainEvent.js';

/**
 * Return a shallow copy of `event` with `fxHint` set (or overridden). Renderers
 * consume `fxHint` to trigger sound/particle/camera effects; keeping the helper
 * immutable means domain events stay safe to share between subscribers.
 */
export function withFxHint<E extends DomainEvent>(event: E, hint: string): E {
  return { ...event, fxHint: hint };
}

/** Read the `fxHint` decoration on an event, if any. */
export function getFxHint(event: DomainEvent): string | undefined {
  return event.fxHint;
}
