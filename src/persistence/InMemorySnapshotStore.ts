import type { AgentSnapshot } from './AgentSnapshot.js';
import type { SnapshotStorePort } from './SnapshotStorePort.js';

/**
 * Process-local snapshot store. Default when no browser localStorage is
 * available (Node, workers, tests).
 */
export class InMemorySnapshotStore implements SnapshotStorePort {
  private readonly entries = new Map<string, AgentSnapshot>();

  save(key: string, snapshot: AgentSnapshot): Promise<void> {
    // Clone so external mutation doesn't bleed into stored state.
    this.entries.set(key, structuredClone(snapshot));
    return Promise.resolve();
  }

  load(key: string): Promise<AgentSnapshot | null> {
    const snap = this.entries.get(key);
    return Promise.resolve(snap ? structuredClone(snap) : null);
  }

  list(): Promise<readonly string[]> {
    return Promise.resolve([...this.entries.keys()]);
  }

  delete(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }
}
