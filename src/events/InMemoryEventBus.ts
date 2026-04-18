import type { DomainEvent } from './DomainEvent.js';
import type { EventBusPort } from './EventBusPort.js';

/**
 * In-memory `EventBusPort` used by default. Single-process, no I/O.
 *
 * Design note: subscriber notifications fire **immediately** on publish so
 * reactive UIs see state updates in-frame, but the perception queue is only
 * consumed by the agent on the next tick. The two channels are intentional.
 */
export class InMemoryEventBus implements EventBusPort {
  private readonly queue: DomainEvent[] = [];
  private readonly listeners = new Set<(event: DomainEvent) => void>();

  publish(event: DomainEvent): void {
    this.queue.push(event);
    // Defensive copy of the listener set to avoid re-entrancy surprises if
    // a subscriber unsubscribes mid-iteration.
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // Subscribers are not allowed to break the bus. Errors are swallowed
        // on purpose; wire a Logger subscriber if you want to see them.
      }
    }
  }

  drain(): DomainEvent[] {
    if (this.queue.length === 0) return [];
    const drained = this.queue.splice(0, this.queue.length);
    return drained;
  }

  subscribe(listener: (event: DomainEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
