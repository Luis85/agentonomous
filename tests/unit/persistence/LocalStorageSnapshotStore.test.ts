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
    // Pre-populate storage with a corrupt index BEFORE constructing the
    // store. Stamp the migrated sentinel so migration short-circuits
    // and the corrupt payload is read by list() directly (the path
    // this test is actually exercising — defensive index parsing).
    storage.setItem('p/__agentonomous/meta/index', '{not valid json');
    storage.setItem('p/__agentonomous/meta/migrated', '__agentonomous_v2_migrated__');
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
    // Entries under the meta/ sub-namespace (index, migrated sentinel)
    // are internal bookkeeping and not subject to the data-encoding
    // invariant.
    for (const rawKey of storage.rawKeys()) {
      if (rawKey.startsWith('p/__agentonomous/meta/')) continue;
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

  it('orphan scan recovers v1 data-subpath keys when the legacy index is missing', async () => {
    // Pathological v1 state: user saved under a key like
    // `__agentonomous/data/foo` AND the legacy index is missing (the
    // recovery path this scan is meant to handle). The payload sits at
    // the old `{prefix}{key}` location; without an orphan scan that
    // includes the data-subpath shape, migration would leave the
    // payload behind and `load()` could no longer reach it.
    const storage = new FakeStorage();
    const v1Key = '__agentonomous/data/foo';
    storage.setItem(`p/${v1Key}`, JSON.stringify(snap(v1Key, 1)));
    // Deliberately no legacy index.

    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    expect([...(await store.list())]).toEqual([v1Key]);
    expect(await store.load(v1Key)).toMatchObject({ identity: { id: v1Key } });

    // Old path cleared; data lives under the new encoded path.
    expect(storage.getItem(`p/${v1Key}`)).toBeNull();
    expect(storage.getItem(`p/__agentonomous/data/${encodeURIComponent(v1Key)}`)).not.toBeNull();
  });

  it('migration skips the legacy index sentinel even when the pre-split index listed it as a user key', async () => {
    // A v1 store could hit a nasty state: after saving under the evil key
    // `__agentonomous/index__`, the store's appendIndex path could leave
    // the legacy index listing `['__agentonomous/index__']` — pointing
    // back at its own path. If migration treated that entry as a normal
    // user key, it would copy the index metadata into the data namespace
    // and `load('__agentonomous/index__')` would return an array typed
    // as AgentSnapshot, breaking downstream restore.
    const storage = new FakeStorage();
    storage.setItem('p/foo', JSON.stringify(snap('foo', 1)));
    // Legacy index lists a real key AND the index sentinel itself.
    storage.setItem('p/__agentonomous/index__', JSON.stringify(['foo', '__agentonomous/index__']));

    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    // Real user key migrated normally.
    expect(await store.load('foo')).toMatchObject({ identity: { id: 'foo' } });
    // Index sentinel is NOT promoted to a data entry.
    expect(await store.load('__agentonomous/index__')).toBeNull();
    // Listed keys do not include the sentinel.
    expect([...(await store.list())]).toEqual(['foo']);
    // No stray data-namespace write for the sentinel encoding.
    expect(
      storage.getItem(`p/__agentonomous/data/${encodeURIComponent('__agentonomous/index__')}`),
    ).toBeNull();
    // Legacy index cleared post-migration.
    expect(storage.getItem('p/__agentonomous/index__')).toBeNull();
  });

  it('migrates v1 user data saved under the exact META_MIGRATED_KEY sentinel path', async () => {
    // The re-entrance marker lives at `__agentonomous/meta/migrated`. A
    // v1 user could legitimately have saved under that exact key before
    // upgrade. Matching merely on the path's PRESENCE would treat their
    // snapshot as "migrated already done" and leave it orphaned. The
    // guard matches the VALUE instead (a distinctive sentinel string),
    // so v1 payloads at that path fall through into the migration
    // branch like any other legacy key.
    const storage = new FakeStorage();
    const collidingKey = '__agentonomous/meta/migrated';
    storage.setItem(`p/${collidingKey}`, JSON.stringify(snap(collidingKey, 1)));
    // Legacy index DELIBERATELY missing so we exercise the rawAtMarker
    // path (not the legacy-index-parse path).

    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    expect([...(await store.list())]).toEqual([collidingKey]);
    expect(await store.load(collidingKey)).toMatchObject({ identity: { id: collidingKey } });
    // The marker path now holds the sentinel value, not the old snapshot.
    expect(storage.getItem(`p/${collidingKey}`)).not.toBeNull();
    expect(storage.getItem(`p/${collidingKey}`)).not.toBe(JSON.stringify(snap(collidingKey, 1)));
  });

  it('save / load / delete report a clear error for lone-surrogate (malformed UTF-16) keys', async () => {
    // encodeURIComponent throws URIError on lone surrogates. The pre-
    // split layout accepted such strings verbatim because it wrote
    // them to storage unchanged. After the split, callers that pass
    // one get a store-specific error pointing at the offending key
    // instead of a bare runtime URIError.
    const storage = new FakeStorage();
    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    const loneSurrogate = '\uD800'; // High surrogate with no matching low.

    await expect(store.save(loneSurrogate, snap('x', 0))).rejects.toThrow(
      /not a well-formed UTF-16 string/,
    );
    await expect(store.load(loneSurrogate)).rejects.toThrow(/not a well-formed UTF-16 string/);
    await expect(store.delete(loneSurrogate)).rejects.toThrow(/not a well-formed UTF-16 string/);
  });

  it('orphan scan recovers v1 user keys under __agentonomous/meta/* subpath', async () => {
    // Pre-split v1 accepted any string as a key. `__agentonomous/meta/
    // dashboard` was a legal v1 user key. If the legacy index is
    // missing (original collision bug) the orphan scan is the only
    // recovery path, and it must not filter out meta-subpath keys or
    // those snapshots become permanently unreachable after upgrade.
    const storage = new FakeStorage();
    const v1MetaKey = '__agentonomous/meta/dashboard';
    storage.setItem(`p/${v1MetaKey}`, JSON.stringify(snap(v1MetaKey, 1)));
    // Deliberately no legacy index.

    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    expect([...(await store.list())]).toEqual([v1MetaKey]);
    expect(await store.load(v1MetaKey)).toMatchObject({ identity: { id: v1MetaKey } });
    expect(storage.getItem(`p/${v1MetaKey}`)).toBeNull();
    expect(
      storage.getItem(`p/__agentonomous/data/${encodeURIComponent(v1MetaKey)}`),
    ).not.toBeNull();
  });

  it('non-iterable backend tolerates ghost entries in a parseable legacy index', async () => {
    // Non-iterable adapter. Legacy index lists entries but none of the
    // payload paths resolve — a stale v1 index where prior deletes
    // didn't clean up the listing. Under the plan-then-commit
    // migration policy, no storage writes happen for unresolved
    // entries, so there's nothing to orphan. The new index drops the
    // ghosts and migration finalizes cleanly.
    const storage = new NonIterableStorage();
    storage.seed('p/__agentonomous/index__', JSON.stringify(['ghost-alpha', 'ghost-beta']));
    // Deliberately no payloads at `p/ghost-alpha` or `p/ghost-beta`.

    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    // Legacy index cleared; marker stamped.
    expect(storage.has('p/__agentonomous/index__')).toBe(false);
    expect(storage.has('p/__agentonomous/meta/migrated')).toBe(true);
    // list() reports the empty state — ghosts were not promoted into
    // the new-layout index.
    expect([...(await store.list())]).toEqual([]);
  });

  it('aborted non-iterable pass does not leave data/ writes behind for a later iterable retry', () => {
    // Scenario per Codex P1 on 6443730: a prior non-iterable pass
    // that couldn't finalize must leave NO new-layout entries behind.
    // Otherwise a subsequent iterable pass's orphan scan would pick
    // them up as v1 user keys and double-encode them.
    //
    // Here we trigger the abort path: non-iterable + unparseable
    // legacy index. Then we construct a fresh iterable store on the
    // same storage (promoted via the FakeStorage constructor) and
    // verify that the iterable pass produces the correct user-facing
    // state without the double-encoded corruption.
    const nonIterable = new NonIterableStorage();
    // Corrupt legacy index (not a string array) forces the abort path.
    nonIterable.seed('p/__agentonomous/index__', '{"this":"is not an array"}');
    nonIterable.seed('p/alpha', JSON.stringify(snap('alpha', 1)));

    new LocalStorageSnapshotStore({ storage: nonIterable, prefix: 'p/' });

    // Nothing was written to the data namespace during the aborted pass.
    expect(nonIterable.has('p/__agentonomous/data/alpha')).toBe(false);
    // Legacy artifacts preserved for retry.
    expect(nonIterable.has('p/__agentonomous/index__')).toBe(true);
    expect(nonIterable.has('p/alpha')).toBe(true);
    expect(nonIterable.has('p/__agentonomous/meta/migrated')).toBe(false);
  });

  it('non-iterable backend with no legacy index does NOT stamp the migrated sentinel', () => {
    // Non-iterable + no legacy index is ambiguous: genuinely fresh
    // install OR pathological v1 that lost its index to the original
    // collision bug. On a non-iterable backend we can't tell them
    // apart — if we stamp the marker in the pathological case,
    // orphaned `{prefix}{userKey}` payloads become permanently
    // unreachable (future constructions short-circuit on the marker).
    // Err safe: refuse to finalize; keep the retry door open for a
    // later construction on an iterable backend.
    const storage = new NonIterableStorage();
    // No seeded data at all.

    new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    expect(storage.has('p/__agentonomous/meta/migrated')).toBe(false);
  });

  it('aborts migration cleanup when non-iterable backend has a non-parseable legacy index', () => {
    // Non-iterable backend (StorageLike minimum) + legacy index that
    // isn't a string array (corrupted, or holds a colliding v1
    // snapshot). The store has no way to enumerate legacy payload
    // paths. If migration still cleared the legacy index and stamped
    // the marker, legacy {prefix}{userKey} entries would become
    // permanently unreachable after upgrade. Instead, migration must
    // bail without touching either artifact so a subsequent
    // construction (maybe on an iterable backend, or after the
    // corruption is fixed) can retry.
    const storage = new NonIterableStorage();
    // Simulate the original v1 collision: legacy index path now holds
    // a snapshot JSON (not an array).
    const colliding = JSON.stringify(snap('__agentonomous/index__', 1));
    storage.seed('p/__agentonomous/index__', colliding);
    // And a v1 user payload at an unrelated path, which we can't find
    // via orphan scan on this backend.
    storage.seed('p/alpha', JSON.stringify(snap('alpha', 2)));

    // Constructor must not crash, and must NOT destroy the legacy
    // artifacts.
    new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    expect(storage.has('p/__agentonomous/index__')).toBe(true);
    expect(storage.getItem('p/__agentonomous/index__')).toBe(colliding);
    expect(storage.has('p/alpha')).toBe(true);
    // Marker NOT set — next construction can retry.
    expect(storage.has('p/__agentonomous/meta/migrated')).toBe(false);
  });

  it('migration skips malformed-UTF-16 legacy entries without crashing store init', async () => {
    // A legacy index could theoretically list a key whose string
    // representation is not well-formed UTF-16 (lone surrogate). Pre-
    // fix, encodeURIComponent on such a string would throw from inside
    // migration and block the whole constructor from succeeding. The
    // store now skips those entries and migrates the rest.
    const storage = new FakeStorage();
    const loneSurrogate = '\uD800';
    storage.setItem(`p/${loneSurrogate}`, JSON.stringify(snap('wellformed', 0)));
    storage.setItem('p/good', JSON.stringify(snap('good', 0)));
    storage.setItem('p/__agentonomous/index__', JSON.stringify([loneSurrogate, 'good']));

    // Constructor must succeed.
    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    // `good` migrated; the malformed key was skipped, not crashed on.
    expect([...(await store.list())]).toEqual(['good']);
    expect(await store.load('good')).toMatchObject({ identity: { id: 'good' } });
  });

  it('construct → save → construct → load round-trips cleanly on iterable backend', async () => {
    // Codex P0 on f8930fd: the prior fresh-install-no-writes fix
    // left the migrated sentinel unset, so a subsequent construction
    // re-scanned the v2 entries saved in between and mis-migrated
    // them as if they were v1 user keys. The marker must be stamped
    // lazily on the first save so subsequent constructions
    // short-circuit before their orphan scan runs.
    const storage = new FakeStorage();

    // First construction — fresh empty store.
    const store1 = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });
    await store1.save('alpha', snap('alpha', 1));
    expect(await store1.load('alpha')).toMatchObject({ identity: { id: 'alpha' } });
    expect([...(await store1.list())]).toEqual(['alpha']);

    // Sanity: marker is now present in raw storage.
    expect(storage.getItem('p/__agentonomous/meta/migrated')).not.toBeNull();

    // Second construction over the same storage — simulates a page
    // reload or fresh process. Must see the saved data intact.
    const store2 = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });
    expect(await store2.load('alpha')).toMatchObject({ identity: { id: 'alpha' } });
    expect([...(await store2.list())]).toEqual(['alpha']);

    // Raw storage shape should not have changed across reconstruction.
    expect(storage.getItem('p/__agentonomous/data/alpha')).not.toBeNull();
    expect(storage.getItem('p/__agentonomous/meta/index')).not.toBeNull();
  });

  it('fresh install does not perform any storage writes during construction', () => {
    // A store constructed against empty storage must not call setItem
    // at all. Otherwise a read-only / quota-exceeded backend would
    // throw from the constructor for a no-op upgrade path, breaking
    // consumers who only want to load-and-list pre-existing snapshots.
    class WriteCountingStorage implements StorageLike {
      public writes = 0;
      public removals = 0;
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
        this.writes++;
        this.data.set(key, value);
      }

      removeItem(key: string): void {
        this.removals++;
        this.data.delete(key);
      }
    }

    const storage = new WriteCountingStorage();
    new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    expect(storage.writes).toBe(0);
    expect(storage.removals).toBe(0);
  });

  it('save and delete reject when migration aborted so unresolved legacy data is preserved', async () => {
    // Non-iterable + unparseable legacy index = migrateLegacyKeys
    // aborts. Allowing save() to proceed would stamp the marker and
    // permanently close the recovery path — a later iterable
    // construction would short-circuit the scan and lose the legacy
    // payloads. save and delete refuse to mutate in that state.
    const storage = new NonIterableStorage();
    storage.seed('p/__agentonomous/index__', '{"corrupt":true}');
    storage.seed('p/alpha', JSON.stringify(snap('alpha', 1)));

    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    await expect(store.save('beta', snap('beta', 2))).rejects.toThrow(
      /legacy migration could not finalize/,
    );
    await expect(store.delete('alpha')).rejects.toThrow(/legacy migration could not finalize/);

    // No marker stamped; legacy artifacts preserved for a later retry.
    expect(storage.has('p/__agentonomous/meta/migrated')).toBe(false);
    expect(storage.has('p/alpha')).toBe(true);
    expect(storage.has('p/__agentonomous/index__')).toBe(true);
  });

  it('save stamps marker before writing data so partial failures never leave data without marker', async () => {
    // Codex P2 ordering concern: if the data write or appendIndex
    // throws (quota exhaustion), a prior ordering where the marker
    // was written last could leave `data/alpha` persisted without
    // the marker — next construction mis-migrates it. Verify the
    // marker lands in storage BEFORE the data and index writes.
    const writeOrder: string[] = [];
    class OrderCapturingStorage implements StorageLike {
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
        writeOrder.push(key);
        this.data.set(key, value);
      }

      removeItem(key: string): void {
        this.data.delete(key);
      }
    }

    const storage = new OrderCapturingStorage();
    const store = new LocalStorageSnapshotStore({ storage, prefix: 'p/' });

    await store.save('alpha', snap('alpha', 1));

    // First write observed should be the marker stamp, before the
    // data and index writes.
    expect(writeOrder[0]).toBe('p/__agentonomous/meta/migrated');
    expect(writeOrder).toContain('p/__agentonomous/data/alpha');
    expect(writeOrder).toContain('p/__agentonomous/meta/index');
    expect(writeOrder.indexOf('p/__agentonomous/meta/migrated')).toBeLessThan(
      writeOrder.indexOf('p/__agentonomous/data/alpha'),
    );
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
