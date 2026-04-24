import type { AgentSnapshot } from './AgentSnapshot.js';
import type { SnapshotStorePort } from './SnapshotStorePort.js';

/**
 * Internal sub-namespace for the index metadata. Split from data so a
 * user-supplied key can never collide with the index itself.
 */
const META_INDEX_KEY = '__agentonomous/meta/index';

/**
 * Internal sub-namespace for snapshot payloads. All user-supplied keys
 * live under this prefix and are `encodeURIComponent`-encoded so strings
 * that look like meta paths (e.g. `__agentonomous/meta/index`) can't
 * escape the data subspace.
 */
const DATA_PREFIX = '__agentonomous/data/';

/**
 * Pre-split legacy layout that v1 shipped — kept here so `migrateLegacyKeys`
 * can rewrite entries from it on first construction.
 */
const LEGACY_INDEX_SUFFIX = '__agentonomous/index__';

/**
 * Sentinel path written at the end of `migrateLegacyKeys` so subsequent
 * constructions short-circuit. Guarantees re-entrance safety without
 * having to disambiguate v1-user-key shapes that happen to match the
 * new `data/` layout.
 */
const META_MIGRATED_KEY = '__agentonomous/meta/migrated';

/**
 * Sentinel VALUE written at `META_MIGRATED_KEY`. Check the value (not
 * just presence) so a v1 user who happened to save under the exact
 * sentinel path is still migrated — the value at their path is a JSON
 * snapshot, which can never equal this string, so they fall through
 * into the migration branch instead of being mistaken for an
 * already-migrated store.
 */
const MIGRATED_MARKER_VALUE = '__agentonomous_v2_migrated__';

/** Minimal storage contract; browser `Storage` satisfies this. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Optional capability: iteration over storage keys. Real `Storage`
 * satisfies this; minimal in-memory test stubs may not. Used only for
 * one-shot legacy migration on construction.
 */
interface IterableStorage extends StorageLike {
  readonly length: number;
  key(index: number): string | null;
}

function isIterableStorage(s: StorageLike): s is IterableStorage {
  const cast = s as Partial<IterableStorage>;
  return typeof cast.length === 'number' && typeof cast.key === 'function';
}

export interface LocalStorageSnapshotStoreOptions {
  /** Prefix for keys. Defaults to `'agentonomous/'`. */
  prefix?: string;
  /**
   * Storage backend. Defaults to `globalThis.localStorage` when available —
   * consumers can inject `sessionStorage` or a stub in tests.
   */
  storage?: StorageLike;
}

/**
 * Snapshot store backed by a `Storage`-like object (typically
 * `window.localStorage`). Serializes via `JSON.stringify` / `JSON.parse`.
 *
 * Keyspace layout (internal; consumers should not depend on it):
 *
 * - `{prefix}__agentonomous/data/{encodeURIComponent(userKey)}` — payloads.
 * - `{prefix}__agentonomous/meta/index` — the O(1) key list backing `list()`.
 *
 * This split means a user-supplied key that literally equals the legacy
 * index path (`__agentonomous/index__`) can't overwrite the index; the
 * encoded path `data/%5F%5F...` is disjoint from `meta/index`.
 *
 * Entries written under the legacy (pre-split) layout are migrated once
 * on construction — see `migrateLegacyKeys`.
 */
export class LocalStorageSnapshotStore implements SnapshotStorePort {
  private readonly prefix: string;
  private readonly storage: StorageLike;

  constructor(opts: LocalStorageSnapshotStoreOptions = {}) {
    const prefix = opts.prefix ?? 'agentonomous/';
    // An empty prefix would make the migration scan match every storage
    // key (`startsWith('')` is always true), which could rewrite and
    // remove unrelated application data on first construction after
    // upgrade. Reject it at the boundary rather than letting it silently
    // corrupt other data.
    if (prefix === '') {
      throw new Error(
        'LocalStorageSnapshotStore: `prefix` must not be empty — an empty namespace would cause migration to match and rewrite unrelated storage keys.',
      );
    }
    this.prefix = prefix;
    const resolved = opts.storage ?? resolveBrowserStorage();
    if (!resolved) {
      throw new Error(
        'LocalStorageSnapshotStore: no `localStorage` available and no storage injected.',
      );
    }
    this.storage = resolved;
    this.migrateLegacyKeys();
  }

  save(key: string, snapshot: AgentSnapshot): Promise<void> {
    let encoded: string;
    try {
      encoded = this.dataKey(key);
    } catch (cause) {
      return Promise.reject(cause as Error);
    }
    this.storage.setItem(encoded, JSON.stringify(snapshot));
    this.appendIndex(key);
    return Promise.resolve();
  }

  load(key: string): Promise<AgentSnapshot | null> {
    let encoded: string;
    try {
      encoded = this.dataKey(key);
    } catch (cause) {
      return Promise.reject(cause as Error);
    }
    const raw = this.storage.getItem(encoded);
    if (raw === null) return Promise.resolve(null);
    try {
      return Promise.resolve(JSON.parse(raw) as AgentSnapshot);
    } catch (cause) {
      return Promise.reject(new Error(`Corrupt snapshot at key '${key}': ${String(cause)}`));
    }
  }

  list(): Promise<readonly string[]> {
    return Promise.resolve(this.readIndex());
  }

  delete(key: string): Promise<void> {
    let encoded: string;
    try {
      encoded = this.dataKey(key);
    } catch (cause) {
      return Promise.reject(cause as Error);
    }
    this.storage.removeItem(encoded);
    this.removeFromIndex(key);
    return Promise.resolve();
  }

  private dataKey(key: string): string {
    // `encodeURIComponent` throws `URIError` on lone-surrogate inputs
    // (malformed UTF-16). Re-raise with a message that points the
    // consumer at the bad key instead of surfacing a bare runtime error
    // from `save` / `load` / `delete`.
    try {
      return this.prefix + DATA_PREFIX + encodeURIComponent(key);
    } catch (cause) {
      throw new Error(
        `LocalStorageSnapshotStore: snapshot key '${key}' is not a well-formed UTF-16 string (${String(cause)}).`,
        { cause },
      );
    }
  }

  private indexKey(): string {
    return this.prefix + META_INDEX_KEY;
  }

  private appendIndex(key: string): void {
    const current = this.readIndex();
    if (current.includes(key)) return;
    this.writeIndex([...current, key]);
  }

  private removeFromIndex(key: string): void {
    const current = this.readIndex();
    this.writeIndex(current.filter((k) => k !== key));
  }

  private readIndex(): readonly string[] {
    const raw = this.storage.getItem(this.indexKey());
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }

  private writeIndex(keys: readonly string[]): void {
    this.storage.setItem(this.indexKey(), JSON.stringify(keys));
  }

  /**
   * One-shot migration from the pre-split layout:
   *
   * - `{prefix}{userKey}` → `{prefix}__agentonomous/data/{encodeURIComponent(userKey)}`
   * - `{prefix}__agentonomous/index__` → `{prefix}__agentonomous/meta/index`
   *
   * Two discovery paths so the public `StorageLike` contract (which
   * requires only getItem/setItem/removeItem) remains supported:
   *
   * - **Legacy index lookup.** Always runs. Reads the known legacy
   *   path directly via `getItem` — no iteration required — and
   *   migrates every user key it lists. Covers persistent custom
   *   adapters that don't expose iteration but still hold legacy data.
   *
   * - **Orphan scan.** Runs only when the backend exposes `length` +
   *   `key(index)`. Picks up entries whose registration in the legacy
   *   index was lost (the original v1 collision bug where saving under
   *   `__agentonomous/index__` wiped the index).
   *
   * Re-entrance: a `META_MIGRATED_KEY` sentinel written at the end
   * short-circuits subsequent constructions. The sentinel is what
   * distinguishes "v1 user key shaped like the new data/ subpath"
   * (migrate) from "new-layout entry this code wrote last run" (leave
   * alone) — without it the scan would have to guess, and any guess
   * loses data in one direction or the other.
   */
  private migrateLegacyKeys(): void {
    // Re-entrance guard: once migration has run, the sentinel value is
    // written at the marker path. Match on VALUE, not mere presence —
    // a v1 user who happened to save under the sentinel path would
    // otherwise be mistaken for an already-migrated store and have
    // their snapshot left orphaned.
    const rawAtMarker = this.storage.getItem(this.prefix + META_MIGRATED_KEY);
    if (rawAtMarker === MIGRATED_MARKER_VALUE) return;

    const legacyKeys = new Set<string>();
    const legacyIndexRaw = this.storage.getItem(this.prefix + LEGACY_INDEX_SUFFIX);
    // If the marker path holds something that ISN'T our sentinel value,
    // it's v1 user data at a colliding path. Treat it as a legacy user
    // key so the snapshot migrates instead of being overwritten when we
    // stamp the sentinel at the end of this pass.
    if (rawAtMarker !== null && rawAtMarker !== MIGRATED_MARKER_VALUE) {
      legacyKeys.add(META_MIGRATED_KEY);
    }

    if (legacyIndexRaw !== null) {
      try {
        const parsed: unknown = JSON.parse(legacyIndexRaw);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            // Defensive: skip the index sentinel itself. A v1 store that
            // hit the original collision bug (saving under a key of
            // `__agentonomous/index__`) could leave that string listed
            // in the index; copying the raw payload at that path — which
            // is index metadata, not a snapshot — into the new data
            // namespace would surface garbage as an AgentSnapshot and
            // break `load()` for that key.
            if (typeof entry === 'string' && entry !== LEGACY_INDEX_SUFFIX) {
              legacyKeys.add(entry);
            }
          }
        }
      } catch {
        // Corrupted legacy index — fall through with whatever the
        // orphan scan (if available) finds. Best-effort recovery.
      }
    }

    if (isIterableStorage(this.storage)) {
      for (let i = 0; i < this.storage.length; i++) {
        const storageKey = this.storage.key(i);
        if (storageKey === null || !storageKey.startsWith(this.prefix)) continue;
        const suffix = storageKey.slice(this.prefix.length);
        if (suffix === LEGACY_INDEX_SUFFIX) continue;
        // Skip our own metadata namespace (index / migrated marker) —
        // not user data, never legacy. Note: do NOT filter out
        // `__agentonomous/data/...` here. Those strings were valid v1
        // user keys, and a pathological v1 store with the legacy index
        // missing would leave them orphaned if we excluded them. The
        // META_MIGRATED_KEY sentinel (checked at function entry) is
        // what prevents re-processing the new-layout entries this
        // code writes on a prior construction.
        if (suffix.startsWith('__agentonomous/meta/')) continue;
        legacyKeys.add(suffix);
      }
    }

    const migrated: string[] = [];
    for (const userKey of legacyKeys) {
      const raw = this.storage.getItem(this.prefix + userKey);
      if (raw === null) continue;
      let encoded: string;
      try {
        encoded = this.dataKey(userKey);
      } catch {
        // Malformed UTF-16 key (lone surrogate) — can't round-trip
        // through encodeURIComponent. Skip so migration doesn't crash
        // store initialization for the other, well-formed entries. The
        // payload stays at the legacy path; the consumer sees it
        // missing from `list()` but storage isn't mutated.
        continue;
      }
      this.storage.setItem(encoded, raw);
      this.storage.removeItem(this.prefix + userKey);
      migrated.push(userKey);
    }
    if (legacyIndexRaw !== null) {
      this.storage.removeItem(this.prefix + LEGACY_INDEX_SUFFIX);
    }

    const migratedIndex = new Set<string>(migrated);
    const existingIndex = this.readIndex();
    for (const entry of existingIndex) migratedIndex.add(entry);
    if (migratedIndex.size > 0) {
      this.writeIndex([...migratedIndex]);
    }

    // Always set the re-entrance sentinel — even on a fresh install
    // with no legacy data — so subsequent constructions short-circuit
    // the scan before it can misinterpret v2 `data/` entries as v1
    // user keys.
    this.storage.setItem(this.prefix + META_MIGRATED_KEY, MIGRATED_MARKER_VALUE);
  }
}

function resolveBrowserStorage(): StorageLike | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { localStorage?: StorageLike };
  return g.localStorage ?? null;
}
