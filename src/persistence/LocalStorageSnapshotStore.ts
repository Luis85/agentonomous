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

/** Minimal storage contract; browser `Storage` satisfies this. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type LocalStorageSnapshotStoreOptions = {
  /** Prefix for keys. Defaults to `'agentonomous/'`. */
  prefix?: string;
  /**
   * Storage backend. Defaults to `globalThis.localStorage` when available —
   * consumers can inject `sessionStorage` or a stub in tests.
   */
  storage?: StorageLike;
};

/**
 * Snapshot store backed by a `Storage`-like object (typically
 * `window.localStorage`). Serializes via `JSON.stringify` / `JSON.parse`.
 *
 * Keyspace layout (internal; consumers should not depend on it):
 *
 * - `{prefix}__agentonomous/data/{encodeURIComponent(userKey)}` — payloads.
 * - `{prefix}__agentonomous/meta/index` — the O(1) key list backing `list()`.
 *
 * Splitting data from metadata means a user-supplied key that would
 * otherwise collide with the index path (e.g. the string
 * `__agentonomous/meta/index`) is `encodeURIComponent`-encoded into
 * the disjoint data subspace and can never overwrite the index.
 */
export class LocalStorageSnapshotStore implements SnapshotStorePort {
  private readonly prefix: string;
  private readonly storage: StorageLike;

  constructor(opts: LocalStorageSnapshotStoreOptions = {}) {
    const prefix = opts.prefix ?? 'agentonomous/';
    // An empty prefix would make `startsWith(prefix)` true for every
    // storage key, so a future scan-style feature could rewrite
    // unrelated application data. Reject it at the boundary rather
    // than leaving that footgun open.
    if (prefix === '') {
      throw new Error(
        'LocalStorageSnapshotStore: `prefix` must not be empty — an empty namespace would collide with unrelated storage keys.',
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
    // consumer at the bad key instead of surfacing a bare runtime
    // error from save / load / delete.
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
}

function resolveBrowserStorage(): StorageLike | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { localStorage?: StorageLike };
  return g.localStorage ?? null;
}
