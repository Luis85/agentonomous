import { describe, expect, it } from 'vitest';
import type { AgentSnapshot } from '../../../src/persistence/AgentSnapshot.js';
import { InMemorySnapshotStore } from '../../../src/persistence/InMemorySnapshotStore.js';
import {
  LocalStorageSnapshotStore,
  type StorageLike,
} from '../../../src/persistence/LocalStorageSnapshotStore.js';

function snap(id: string, at: number): AgentSnapshot {
  return {
    schemaVersion: 1,
    snapshotAt: at,
    identity: { id, name: id, version: '0.0.0', role: 'npc', species: 'cat' },
  };
}

class FakeStorage implements StorageLike {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe('InMemorySnapshotStore', () => {
  it('saves, loads, lists, deletes', async () => {
    const store = new InMemorySnapshotStore();
    await store.save('whiskers', snap('whiskers', 100));
    expect(await store.list()).toEqual(['whiskers']);
    const loaded = await store.load('whiskers');
    expect(loaded?.identity.id).toBe('whiskers');
    await store.delete('whiskers');
    expect(await store.load('whiskers')).toBeNull();
  });

  it('clones on save and load so external mutation is isolated', async () => {
    const store = new InMemorySnapshotStore();
    const original = snap('a', 1);
    await store.save('a', original);
    const loaded = await store.load('a');
    // Mutating loaded copy should not affect stored snapshot.
    if (loaded) loaded.snapshotAt = 9_999;
    const reloaded = await store.load('a');
    expect(reloaded?.snapshotAt).toBe(1);
  });
});

describe('LocalStorageSnapshotStore', () => {
  it('saves, loads, lists, deletes with injected storage', async () => {
    const storage = new FakeStorage();
    const store = new LocalStorageSnapshotStore({ storage, prefix: 'test/' });
    await store.save('pet', snap('pet', 10));
    expect(await store.load('pet')).toMatchObject({ identity: { id: 'pet' } });
    expect(await store.list()).toEqual(['pet']);
    await store.delete('pet');
    expect(await store.load('pet')).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('list is O(1) via an index entry', async () => {
    const storage = new FakeStorage();
    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });
    await store.save('a', snap('a', 0));
    await store.save('b', snap('b', 0));
    await store.save('a', snap('a', 1)); // dedupe
    expect(await store.list()).toEqual(['a', 'b']);
  });

  it('throws when no localStorage is available and no storage injected', () => {
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    try {
      (globalThis as { localStorage?: unknown }).localStorage = undefined;
      expect(() => new LocalStorageSnapshotStore()).toThrow(/no .*localStorage/);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });
});
