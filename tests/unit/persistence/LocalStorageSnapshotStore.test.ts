import { describe, expect, it } from 'vitest';
import type { AgentSnapshot } from '../../../src/persistence/AgentSnapshot.js';
import {
  LocalStorageSnapshotStore,
  type StorageLike,
} from '../../../src/persistence/LocalStorageSnapshotStore.js';

function snap(id: string, at = 0): AgentSnapshot {
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

  rawKeys(): string[] {
    return [...this.data.keys()];
  }
}

describe('LocalStorageSnapshotStore — keyspace split (PR #2 remediation)', () => {
  it('save / load / list / delete round-trip for a plain key', async () => {
    const storage = new FakeStorage();
    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    await store.save('pet', snap('pet', 10));
    expect(await store.load('pet')).toMatchObject({ identity: { id: 'pet' } });
    expect(await store.list()).toEqual(['pet']);

    await store.delete('pet');
    expect(await store.load('pet')).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it("user key that would have collided with the pre-split index path ('__agentonomous/index__') does not overwrite the index", async () => {
    const storage = new FakeStorage();
    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    await store.save('real', snap('real', 1));
    const collidingKey = '__agentonomous/index__';
    await store.save(collidingKey, snap(collidingKey, 2));

    // Both keys round-trip; index still lists them.
    expect(await store.list()).toEqual(expect.arrayContaining(['real', collidingKey]));
    expect(await store.load('real')).toMatchObject({ identity: { id: 'real' } });
    expect(await store.load(collidingKey)).toMatchObject({ identity: { id: collidingKey } });

    // Index lives at the new meta path; the pre-split path is unused.
    expect(storage.getItem('p/__agentonomous/meta/index')).not.toBeNull();
    expect(storage.getItem('p/__agentonomous/index__')).toBeNull();
  });

  it('recovers gracefully when the index payload is malformed JSON', async () => {
    const storage = new FakeStorage();
    storage.setItem('p/__agentonomous/meta/index', '{not valid json');
    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    // list() does not throw; returns empty.
    expect(await store.list()).toEqual([]);

    // Subsequent save overwrites the corrupt index with a valid one.
    await store.save('pet', snap('pet', 0));
    expect(await store.list()).toEqual(['pet']);
  });

  it('round-trips keys containing URI-special characters', async () => {
    const storage = new FakeStorage();
    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    const keys = ['a/b', 'c:d', 'with space', 'café', '🐱-pet', '%20preencoded'];
    for (const k of keys) await store.save(k, snap(k, 0));

    const listed = [...(await store.list())].sort();
    expect(listed).toEqual([...keys].sort());
    for (const k of keys) {
      expect(await store.load(k)).toMatchObject({ identity: { id: k } });
    }

    // Every raw storage key is either the meta index or lives under
    // the encoded data prefix.
    for (const rawKey of storage.rawKeys()) {
      if (rawKey === 'p/__agentonomous/meta/index') continue;
      expect(rawKey.startsWith('p/__agentonomous/data/')).toBe(true);
    }
  });

  it('save / load / delete report a clear error for lone-surrogate (malformed UTF-16) keys', async () => {
    // encodeURIComponent throws URIError on lone surrogates. Re-raise
    // with a store-specific message that points at the offending key.
    const storage = new FakeStorage();
    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    const loneSurrogate = '\uD800';

    await expect(store.save(loneSurrogate, snap('x', 0))).rejects.toThrow(
      /not a well-formed UTF-16 string/,
    );
    await expect(store.load(loneSurrogate)).rejects.toThrow(/not a well-formed UTF-16 string/);
    await expect(store.delete(loneSurrogate)).rejects.toThrow(/not a well-formed UTF-16 string/);
  });

  it("rejects an empty prefix so it can't collide with unrelated storage keys", () => {
    const storage = new FakeStorage();
    expect(() => new LocalStorageSnapshotStore({ storage, prefix: '' })).toThrow(
      /prefix.*must not be empty/i,
    );
  });
});
