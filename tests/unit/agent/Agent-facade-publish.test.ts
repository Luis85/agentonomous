import { describe, expect, it } from 'vitest';
import type { AgentModule } from '../../../src/agent/AgentModule.js';
import { createAgent } from '../../../src/agent/createAgent.js';
import type { DomainEvent } from '../../../src/events/DomainEvent.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { InMemorySnapshotStore } from '../../../src/persistence/InMemorySnapshotStore.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

/**
 * Regression coverage for `AgentFacade.publishEvent`. The facade must publish
 * through the same internal path used by skill contexts and kernel-originated
 * events — i.e. `Agent.publishEvent` — so facade-emitted events (a) land on the
 * current tick's `DecisionTrace.emitted` list and (b) are observed by the
 * autosave event-trigger tracker. Both invariants regressed when the facade
 * was wired straight to `eventBus.publish()`.
 */
describe('AgentFacade.publishEvent', () => {
  it('places facade-published events into the current tick trace', async () => {
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

    // Seed a Trigger onto the bus so Stage 1 dispatches the reactive handler
    // mid-tick. The handler then publishes FacadeCustom via the facade — the
    // code path the fix unifies with `Agent.publishEvent`.
    bus.publish({ type: 'Trigger', at: 0 } as DomainEvent);

    const trace = await agent.tick(0.016);

    expect(trace.emitted.some((e) => e.type === 'FacadeCustom')).toBe(true);
  });

  it('observes facade-published events through the autosave tracker', async () => {
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

    const store = new InMemorySnapshotStore();
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: bus,
      modules: [publisher],
      persistence: {
        store,
        autoSave: { enabled: true, onEvents: ['FacadeCustom'] },
        autoSaveKey: 'test-pet',
      },
    });

    // First tick: no Trigger on the bus → no FacadeCustom → no save.
    await agent.tick(0);
    expect(await store.list()).toEqual([]);

    // Seed Trigger; Stage 1 dispatches the reactive handler, which publishes
    // FacadeCustom via the facade. With the fix, the autosave tracker's
    // `observeEvent('FacadeCustom')` fires and `shouldSave()` flips true by
    // end of tick.
    bus.publish({ type: 'Trigger', at: 0 } as DomainEvent);
    await agent.tick(0);

    expect(await store.list()).toEqual(['test-pet']);
  });
});
