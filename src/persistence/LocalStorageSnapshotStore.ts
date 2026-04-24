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
    this.storage.setItem(this.dataKey(key), JSON.stringify(snapshot));
    this.appendIndex(key);
    return Promise.resolve();
  }

  load(key: string): Promise<AgentSnapshot | null> {
    const raw = this.storage.getItem(this.dataKey(key));
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
    this.storage.removeItem(this.dataKey(key));
    this.removeFromIndex(key);
    return Promise.resolve();
  }

  private dataKey(key: string): string {
    return this.prefix + DATA_PREFIX + encodeURIComponent(key);
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
   *   `__agentonomous/index__` wiped the index). The filter on the
   *   new-layout subpaths keeps the scan re-entrant — on subsequent
   *   constructions it finds only post-split entries and short-circuits.
   */
  private migrateLegacyKeys(): void {
    const legacyKeys = new Set<string>();
    const legacyIndexRaw = this.storage.getItem(this.prefix + LEGACY_INDEX_SUFFIX);

    if (legacyIndexRaw !== null) {
      try {
        const parsed: unknown = JSON.parse(legacyIndexRaw);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (typeof entry === 'string') legacyKeys.add(entry);
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
        // Skip new-layout subpaths so subsequent constructions don't
        // re-process entries this code wrote on a prior run.
        if (suffix.startsWith(DATA_PREFIX) || suffix.startsWith('__agentonomous/meta/')) continue;
        legacyKeys.add(suffix);
      }
    }

    if (legacyKeys.size === 0 && legacyIndexRaw === null) return;

    for (const userKey of legacyKeys) {
      const raw = this.storage.getItem(this.prefix + userKey);
      if (raw !== null) {
        this.storage.setItem(this.dataKey(userKey), raw);
        this.storage.removeItem(this.prefix + userKey);
      }
    }
    if (legacyIndexRaw !== null) {
      this.storage.removeItem(this.prefix + LEGACY_INDEX_SUFFIX);
    }

    const migratedIndex = new Set<string>(legacyKeys);
    const existingIndex = this.readIndex();
    for (const entry of existingIndex) migratedIndex.add(entry);
    this.writeIndex([...migratedIndex]);
  }
}

function resolveBrowserStorage(): StorageLike | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { localStorage?: StorageLike };
  return g.localStorage ?? null;
}
