import type { DomainEvent } from './DomainEvent.js';

/**
 * Pub/sub port. Agents publish events; external consumers subscribe.
 * The bus also queues events between ticks — `drain()` hands the pending
 * list to the agent at the start of its next tick.
 *
 * Event ordering rule (see plan §Time & tick contract): events emitted
 * during tick N land in tick N+1's perception queue.
 */
export type EventBusPort = {
  /** Queue an event for both perception (next tick) and subscribers (immediately). */
  publish(event: DomainEvent): void;

  /** Drain pending events and return them in publish order. */
  drain(): DomainEvent[];

  /** Subscribe to all events. Returns an unsubscribe function. */
  subscribe(listener: (event: DomainEvent) => void): () => void;
};
