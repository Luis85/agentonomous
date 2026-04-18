import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemorySnapshotStore } from '../../../src/persistence/InMemorySnapshotStore.js';
import { LocalStorageSnapshotStore } from '../../../src/persistence/LocalStorageSnapshotStore.js';
import { pickDefaultSnapshotStore } from '../../../src/persistence/pickDefaultSnapshotStore.js';

describe('pickDefaultSnapshotStore', () => {
  const g = globalThis as { localStorage?: unknown };
  let original: unknown;

  beforeEach(() => {
    original = g.localStorage;
  });

  afterEach(() => {
    g.localStorage = original;
  });

  it('returns InMemorySnapshotStore when localStorage is unavailable', () => {
    g.localStorage = undefined;
    const store = pickDefaultSnapshotStore();
    expect(store).toBeInstanceOf(InMemorySnapshotStore);
  });

  it('returns LocalStorageSnapshotStore when a storage-like object is present', () => {
    g.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const store = pickDefaultSnapshotStore();
    expect(store).toBeInstanceOf(LocalStorageSnapshotStore);
  });
});
