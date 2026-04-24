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

/**
 * `StorageLike`-satisfying fake WITHOUT iteration — exposes only the
 * three methods the public interface requires. Used to assert that
 * persistent custom adapters (which may not implement `length` / `key`)
 * still get legacy data migrated via the legacy-index lookup path.
 */
class NonIterableStorage implements StorageLike {
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

  seed(key: string, value: string): void {
    this.data.set(key, value);
  }

  has(key: string): boolean {
    return this.data.has(key);
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

  it('migration handles legacy user keys that look like reserved subpaths', async () => {
    // v1 layout was `{prefix}{userKey}`, so a user could legitimately have
    // saved under a key like `__agentonomous/data/foo` or
    // `__agentonomous/meta/something`. The scan filter that keeps the
    // migration re-entrant for new-layout entries would otherwise skip
    // those legacy entries, leaving the data orphaned at the old path
    // while the new index claimed it existed — `load()` would return
    // null and the snapshot would be unreachable. The legacy index union
    // ensures index-registered keys migrate regardless of their shape.
    const storage = new FakeStorage();
    const reservedDataKey = '__agentonomous/data/foo';
    const reservedMetaKey = '__agentonomous/meta/dashboard';
    storage.setItem(`p/${reservedDataKey}`, JSON.stringify(snap(reservedDataKey, 1)));
    storage.setItem(`p/${reservedMetaKey}`, JSON.stringify(snap(reservedMetaKey, 2)));
    storage.setItem('p/__agentonomous/index__', JSON.stringify([reservedDataKey, reservedMetaKey]));

    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    const listed = [...(await store.list())].sort();
    expect(listed).toEqual([reservedDataKey, reservedMetaKey].sort());

    expect(await store.load(reservedDataKey)).toMatchObject({
      identity: { id: reservedDataKey },
    });
    expect(await store.load(reservedMetaKey)).toMatchObject({
      identity: { id: reservedMetaKey },
    });

    // Legacy paths cleared; data lives under encoded new-layout paths.
    expect(storage.getItem(`p/${reservedDataKey}`)).toBeNull();
    expect(storage.getItem(`p/${reservedMetaKey}`)).toBeNull();
    expect(storage.getItem('p/__agentonomous/index__')).toBeNull();
    expect(
      storage.getItem(`p/__agentonomous/data/${encodeURIComponent(reservedDataKey)}`),
    ).not.toBeNull();
    expect(
      storage.getItem(`p/__agentonomous/data/${encodeURIComponent(reservedMetaKey)}`),
    ).not.toBeNull();
  });

  it('migration is idempotent — second construction does not re-process new-layout entries', async () => {
    // Migration runs once on construction. A second construction over the
    // same storage must NOT re-process the new-layout `data/` entries
    // written by the first run as if they were legacy keys (which would
    // double-encode them and corrupt the layout).
    const storage = new FakeStorage();
    storage.setItem('p/alpha', JSON.stringify(snap('alpha', 1)));
    storage.setItem('p/__agentonomous/index__', JSON.stringify(['alpha']));

    new LocalStorageSnapshotStore({ storage, prefix: 'p/' });
    const rawAfterFirst = [...storage.rawKeys()].sort();

    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });
    const rawAfterSecond = [...storage.rawKeys()].sort();

    expect(rawAfterSecond).toEqual(rawAfterFirst);
    expect(await store.load('alpha')).toMatchObject({ identity: { id: 'alpha' } });
    expect([...(await store.list())]).toEqual(['alpha']);
  });

  it('migration works on StorageLike backends that do NOT expose iteration (length/key)', async () => {
    // Persistent custom adapters (`node-localstorage`-style, custom
    // IndexedDB shims) may satisfy only the required getItem/setItem/
    // removeItem surface of StorageLike. Without iteration the store
    // cannot do an orphan scan, but it CAN still migrate every key
    // registered in the legacy index — the index path is known, read via
    // getItem. Snapshots listed in the legacy index must therefore
    // migrate end-to-end on those backends too.
    const storage = new NonIterableStorage();
    storage.seed('p/alpha', JSON.stringify(snap('alpha', 1)));
    storage.seed('p/beta', JSON.stringify(snap('beta', 2)));
    storage.seed('p/__agentonomous/index__', JSON.stringify(['alpha', 'beta']));

    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    const listed = [...(await store.list())].sort();
    expect(listed).toEqual(['alpha', 'beta']);
    expect(await store.load('alpha')).toMatchObject({ identity: { id: 'alpha' } });
    expect(await store.load('beta')).toMatchObject({ identity: { id: 'beta' } });

    // Legacy paths cleared; data lives under the new encoded data path.
    expect(storage.has('p/alpha')).toBe(false);
    expect(storage.has('p/beta')).toBe(false);
    expect(storage.has('p/__agentonomous/index__')).toBe(false);
    expect(storage.has('p/__agentonomous/data/alpha')).toBe(true);
    expect(storage.has('p/__agentonomous/data/beta')).toBe(true);
    expect(storage.has('p/__agentonomous/meta/index')).toBe(true);
  });

  it("rejects an empty prefix so migration can't match and nuke unrelated storage keys", () => {
    // A prefix of '' would make startsWith(prefix) true for every key in
    // the storage, so migration would rewrite and delete unrelated
    // application data on first construction. Fail loudly at the
    // boundary instead.
    const storage = new FakeStorage();
    expect(() => new LocalStorageSnapshotStore({ storage, prefix: '' })).toThrow(
      /prefix.*must not be empty/i,
    );
  });

  it('empty-prefix guard does not corrupt pre-existing unrelated storage data', () => {
    // Concretely: if a consumer tried the misuse, the constructor must
    // throw BEFORE migration runs, so any unrelated keys they had in
    // storage stay untouched.
    const storage = new FakeStorage();
    storage.setItem('unrelated-app/userPrefs', JSON.stringify({ theme: 'dark' }));
    storage.setItem('other-tool/cache', 'abc');

    expect(() => new LocalStorageSnapshotStore({ storage, prefix: '' })).toThrow();

    expect(storage.getItem('unrelated-app/userPrefs')).toBe(JSON.stringify({ theme: 'dark' }));
    expect(storage.getItem('other-tool/cache')).toBe('abc');
  });
});
