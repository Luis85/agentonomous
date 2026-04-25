import type { AgentSnapshot } from './AgentSnapshot.js';

/**
 * Port for persisting `AgentSnapshot`s. Adapters handle localStorage,
 * filesystem, IndexedDB, or any remote store.
 *
 * Keys are free-form strings (typically the agent id, or a save slot name
 * like `"whiskers#autosave"`).
 */
export type SnapshotStorePort = {
  save(key: string, snapshot: AgentSnapshot): Promise<void>;
  load(key: string): Promise<AgentSnapshot | null>;
  list(): Promise<readonly string[]>;
  delete(key: string): Promise<void>;
};
