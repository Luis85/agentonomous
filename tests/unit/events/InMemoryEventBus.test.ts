import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';

describe('InMemoryEventBus', () => {
  it('queues events for drain in FIFO order', () => {
    const bus = new InMemoryEventBus();
    bus.publish({ type: 'A', at: 1 });
    bus.publish({ type: 'B', at: 2 });
    bus.publish({ type: 'C', at: 3 });

    const drained = bus.drain();
    expect(drained.map((e) => e.type)).toEqual(['A', 'B', 'C']);
  });

  it('drain() clears the queue', () => {
    const bus = new InMemoryEventBus();
    bus.publish({ type: 'x', at: 0 });
    bus.drain();
    expect(bus.drain()).toEqual([]);
  });

  it('notifies subscribers synchronously on publish', () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    bus.subscribe(listener);

    bus.publish({ type: 'foo', at: 1 });
    expect(listener).toHaveBeenCalledWith({ type: 'foo', at: 1 });
  });

  it('subscribe() returns an unsubscribe function', () => {
    const bus = new InMemoryEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    bus.publish({ type: 'a', at: 1 });
    unsubscribe();
    bus.publish({ type: 'b', at: 2 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ type: 'a', at: 1 });
  });

  it('survives listener exceptions (they do not break the bus)', () => {
    const bus = new InMemoryEventBus();
    const broken = vi.fn().mockImplementation(() => {
      throw new Error('listener fell over');
    });
    const healthy = vi.fn();

    bus.subscribe(broken);
    bus.subscribe(healthy);

    expect(() => bus.publish({ type: 'x', at: 1 })).not.toThrow();
    expect(healthy).toHaveBeenCalled();
  });

  it('handles mid-iteration unsubscribe without skipping listeners', () => {
    const bus = new InMemoryEventBus();
    const order: string[] = [];

    const unsubA = bus.subscribe(() => {
      order.push('a');
      unsubA();
    });
    bus.subscribe(() => order.push('b'));

    bus.publish({ type: 'ping', at: 0 });
    expect(order).toEqual(['a', 'b']);

    // A is unsubscribed after the first publish.
    bus.publish({ type: 'ping', at: 0 });
    expect(order).toEqual(['a', 'b', 'b']);
  });
});
