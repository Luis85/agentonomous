import { InMemorySnapshotStore } from './InMemorySnapshotStore.js';
import { LocalStorageSnapshotStore } from './LocalStorageSnapshotStore.js';
import type { SnapshotStorePort } from './SnapshotStorePort.js';

/**
 * Environment-aware default picker used by `createAgent`.
 *
 * Priority:
 * 1. If `globalThis.localStorage` is available (browser), return a
 *    `LocalStorageSnapshotStore` — zero-config persistence across tab
 *    reloads, exactly what the MVP product demo needs.
 * 2. Otherwise (Node, workers, unknown env), return `InMemorySnapshotStore`
 *    so nothing blows up.
 *
 * Consumers who want filesystem persistence in Node pass an explicit
 * `FsSnapshotStore` via `createAgent({ persistence: { store } })`.
 */
export function pickDefaultSnapshotStore(): SnapshotStorePort {
  if (hasBrowserLocalStorage()) {
    try {
      return new LocalStorageSnapshotStore();
    } catch {
      // Fallback if the browser environment denies storage access (e.g.,
      // sandboxed iframes, private-browsing quotas).
      return new InMemorySnapshotStore();
    }
  }
  return new InMemorySnapshotStore();
}

function hasBrowserLocalStorage(): boolean {
  if (typeof globalThis === 'undefined') return false;
  // Some browser environments install a throwing getter for `localStorage`
  // (e.g. sandboxed third-party iframes blocked by SecurityError, or
  // strict private-browsing modes). Reading the property throws; guard
  // so the caller can still fall back to `InMemorySnapshotStore` instead
  // of crashing before store selection finishes.
  try {
    const g = globalThis as { localStorage?: unknown };
    return typeof g.localStorage === 'object' && g.localStorage !== null;
  } catch {
    return false;
  }
}
