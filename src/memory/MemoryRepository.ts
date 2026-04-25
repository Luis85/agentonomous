import type { MemoryKind, MemoryRecord } from './MemoryRecord.js';

/**
 * Query filter used by `MemoryRepository.query()`. Empty filter returns
 * everything the repository has.
 */
export type MemoryFilter = {
  kinds?: readonly MemoryKind[];
  /** Records that have *any* of these topics. */
  topics?: readonly string[];
  /** Minimum importance. */
  minImportance?: number;
  /** Minimum confidence. */
  minConfidence?: number;
  /** Records created on or after this wall-clock ms. */
  sinceMs?: number;
  /** Max number of records to return. Sorted by createdAt descending. */
  limit?: number;
};

/**
 * Port for memory persistence. Implementations decide storage format and
 * indexing strategy. The library ships an `InMemoryMemoryAdapter` out of
 * the box; other adapters (filesystem, IndexedDB, Markdown) can be
 * supplied by consumers.
 */
export type MemoryRepository = {
  save(record: MemoryRecord): Promise<void>;
  get(id: string): Promise<MemoryRecord | null>;
  query(filter?: MemoryFilter): Promise<readonly MemoryRecord[]>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
};
