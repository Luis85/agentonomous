import { describe, expect, it } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import { InMemorySnapshotStore } from '../../../src/persistence/InMemorySnapshotStore.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

/**
 * Pause-aware autosave: with `setTimeScale(0)` active, paused ticks
 * must not count toward `everyTicks`. Otherwise the default policy
 * would churn the snapshot store at display-refresh rate (60fps) while
 * the rest of the simulation is explicitly frozen — surprising and
 * wasteful, especially on `LocalStorageSnapshotStore` where each save
 * is an I/O trip.
 */
describe('Agent autosave — pause behavior', () => {
  it('does not autosave while paused (setTimeScale(0))', async () => {
    const store = new InMemorySnapshotStore();
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(1_000),
      rng: 0,
      persistence: {
        store,
        autoSave: { enabled: true, everyTicks: 2 },
        autoSaveKey: 'test',
      },
    });

    agent.setTimeScale(0);
    for (let i = 0; i < 10; i++) {
      await agent.tick(0.016);
    }

    expect(await store.load('test')).toBeNull();
  });

  it('resumes autosave after unpause', async () => {
    const store = new InMemorySnapshotStore();
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(1_000),
      rng: 0,
      persistence: {
        store,
        autoSave: { enabled: true, everyTicks: 2 },
        autoSaveKey: 'test',
      },
    });

    agent.setTimeScale(0);
    for (let i = 0; i < 5; i++) {
      await agent.tick(0.016);
    }
    expect(await store.load('test')).toBeNull();

    agent.setTimeScale(1);
    for (let i = 0; i < 3; i++) {
      await agent.tick(0.016);
    }

    expect(await store.load('test')).not.toBeNull();
  });
});
