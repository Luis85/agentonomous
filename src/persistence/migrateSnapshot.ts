import { SnapshotRestoreError } from '../agent/errors.js';
import { CURRENT_SNAPSHOT_VERSION, type AgentSnapshot } from './AgentSnapshot.js';

/**
 * Per-major-version migration function. Each migration takes the previous
 * version's snapshot shape and returns the next version's shape.
 */
export type SnapshotMigration = (snapshot: unknown) => unknown;

/**
 * Registry of migrations keyed by the target schema version. Populated as
 * we bump the snapshot shape across library releases. V1 has no predecessors
 * yet, so the registry is empty; the plumbing exists for the first bump.
 */
export const SNAPSHOT_MIGRATIONS: Readonly<Record<number, SnapshotMigration>> = {};

/**
 * Step a snapshot forward to `target` (or `CURRENT_SNAPSHOT_VERSION`) by
 * chaining migrations. Throws `SnapshotRestoreError` if a step is missing.
 */
export function migrateSnapshot(
  raw: unknown,
  target: number = CURRENT_SNAPSHOT_VERSION,
): AgentSnapshot {
  if (raw === null || typeof raw !== 'object') {
    throw new SnapshotRestoreError('Snapshot payload is not an object');
  }
  const versionRaw = (raw as { schemaVersion?: unknown }).schemaVersion;
  const currentVersion = typeof versionRaw === 'number' ? versionRaw : 0;
  if (currentVersion > target) {
    throw new SnapshotRestoreError(
      `Snapshot schemaVersion (${currentVersion}) is newer than supported (${target}). ` +
        `Upgrade the library.`,
    );
  }
  let cursor: unknown = raw;
  for (let v = currentVersion + 1; v <= target; v++) {
    const step = SNAPSHOT_MIGRATIONS[v];
    if (!step) {
      throw new SnapshotRestoreError(`No migration registered for schemaVersion ${v}`);
    }
    cursor = step(cursor);
  }
  return cursor as AgentSnapshot;
}
