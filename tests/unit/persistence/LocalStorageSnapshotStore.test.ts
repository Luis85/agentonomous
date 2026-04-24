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

/**
 * Minimal `Storage`-shaped fake that supports iteration. Mirrors the
 * browser `Storage` API (getItem / setItem / removeItem / length /
 * key(i)) so migration scans find legacy entries.
 */
class FakeStorage implements StorageLike {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

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

  it("user key equal to the legacy index path ('__agentonomous/index__') no longer corrupts the index", async () => {
    const storage = new FakeStorage();
    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    // Save a legitimate entry first so the index is non-empty.
    await store.save('real', snap('real', 1));
    // Save under a key string that matches the legacy index path byte-for-byte.
    const evilKey = '__agentonomous/index__';
    await store.save(evilKey, snap(evilKey, 2));

    // Both keys are listed, index unaffected.
    expect(await store.list()).toEqual(expect.arrayContaining(['real', evilKey]));
    expect(await store.load('real')).toMatchObject({ identity: { id: 'real' } });
    expect(await store.load(evilKey)).toMatchObject({ identity: { id: evilKey } });

    // Index is stored under the new meta path, not the legacy one.
    expect(storage.getItem('p/__agentonomous/meta/index')).not.toBeNull();
    // Nothing lives under the legacy index path.
    expect(storage.getItem('p/__agentonomous/index__')).toBeNull();
  });

  it('recovers gracefully when the index payload is malformed JSON', async () => {
    const storage = new FakeStorage();
    // Pre-populate storage with a corrupt index BEFORE constructing the store
    // so migration has nothing to rewrite and the corrupt payload survives.
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

    // No raw storage key contains the unencoded special chars in the
    // user-supplied portion — all live under the encoded data/ prefix.
    for (const rawKey of storage.rawKeys()) {
      if (rawKey.endsWith('/meta/index')) continue;
      expect(rawKey.startsWith('p/__agentonomous/data/')).toBe(true);
    }
  });

  it('migrates legacy (pre-split) entries on construction', async () => {
    const storage = new FakeStorage();
    // Seed storage with the v1 layout: `{prefix}{userKey}` payloads and a
    // `{prefix}__agentonomous/index__` index.
    storage.setItem('p/alpha', JSON.stringify(snap('alpha', 1)));
    storage.setItem('p/beta', JSON.stringify(snap('beta', 2)));
    storage.setItem('p/__agentonomous/index__', JSON.stringify(['alpha', 'beta']));

    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    // list() reports decoded user keys.
    const listed = [...(await store.list())].sort();
    expect(listed).toEqual(['alpha', 'beta']);

    // Payloads load from the new encoded data path.
    expect(await store.load('alpha')).toMatchObject({ identity: { id: 'alpha' } });
    expect(await store.load('beta')).toMatchObject({ identity: { id: 'beta' } });

    // Legacy keys are gone from raw storage; new keys under data/ + meta/.
    expect(storage.getItem('p/alpha')).toBeNull();
    expect(storage.getItem('p/beta')).toBeNull();
    expect(storage.getItem('p/__agentonomous/index__')).toBeNull();
    expect(storage.getItem('p/__agentonomous/data/alpha')).not.toBeNull();
    expect(storage.getItem('p/__agentonomous/data/beta')).not.toBeNull();
    expect(storage.getItem('p/__agentonomous/meta/index')).not.toBeNull();
  });

  it('migration recovers data entries even when the legacy index is missing', async () => {
    // The legacy shipping bug could have wiped the index (user key ==
    // '__agentonomous/index__'). Data entries still live under raw
    // prefixed paths; migration picks them up from the storage scan.
    const storage = new FakeStorage();
    storage.setItem('p/alpha', JSON.stringify(snap('alpha', 1)));
    storage.setItem('p/beta', JSON.stringify(snap('beta', 2)));
    // Deliberately no legacy index.

    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    const listed = [...(await store.list())].sort();
    expect(listed).toEqual(['alpha', 'beta']);
  });
});
