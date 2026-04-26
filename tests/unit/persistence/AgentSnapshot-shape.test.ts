import { describe, expect, it } from 'vitest';
import type { AgentModule } from '../../../src/agent/AgentModule.js';
import { createAgent } from '../../../src/agent/createAgent.js';
import type { DomainEvent } from '../../../src/events/DomainEvent.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

/**
 * Contract pin for `AgentSnapshot.pendingEvents`: the field was declared on
 * the type but never populated by `Agent.snapshot()` nor read by
 * `Agent.restore()`. This suite locks that absence so a future change cannot
 * quietly resurrect the field without an accompanying implementation.
 *
 * If event-queue persistence is genuinely wanted later, re-introducing a
 * `pendingEvents` payload must update (or remove) this test — an explicit
 * signal that the contract is changing.
 */
describe('AgentSnapshot shape — pendingEvents', () => {
  it('snapshot() output does not include a pendingEvents key on a fresh agent', () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      persistence: false,
    });

    const snap = agent.snapshot();
    expect(snap).not.toHaveProperty('pendingEvents');
  });

  it('snapshot() output does not include a pendingEvents key after ticks and facade-published events', async () => {
    const bus = new InMemoryEventBus();
    const publisher: AgentModule = {
      id: 'facade-publisher',
      reactiveHandlers: [
        {
          on: 'Trigger',
          handle: (_event, facade) => {
            facade.publishEvent({
              type: 'FacadeCustom',
              at: facade.clock.now(),
            } as DomainEvent);
          },
        },
      ],
    };

    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: bus,
      modules: [publisher],
      persistence: false,
    });

    // Exercise a tick plus in-flight events to rule out any hypothetical
    // conditional branch populating `pendingEvents`.
    bus.publish({ type: 'Trigger', at: 0 } as DomainEvent);
    await agent.tick(0.016);
    await agent.tick(0.016);

    const snap = agent.snapshot();
    expect(snap).not.toHaveProperty('pendingEvents');
  });
});
