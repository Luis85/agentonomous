import type { MemoryRecord } from './MemoryRecord.js';
import type { MemoryFilter, MemoryRepository } from './MemoryRepository.js';

/**
 * Process-local memory store. Default Phase A adapter. Fast, zero-I/O,
 * loses data on process exit unless a snapshot is taken.
 */
export class InMemoryMemoryAdapter implements MemoryRepository {
  private readonly records = new Map<string, MemoryRecord>();

  save(record: MemoryRecord): Promise<void> {
    this.records.set(record.id, record);
    return Promise.resolve();
  }

  get(id: string): Promise<MemoryRecord | null> {
    return Promise.resolve(this.records.get(id) ?? null);
  }

  query(filter: MemoryFilter = {}): Promise<readonly MemoryRecord[]> {
    const out: MemoryRecord[] = [];
    for (const record of this.records.values()) {
      if (!matchesFilter(record, filter)) continue;
      out.push(record);
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return Promise.resolve(filter.limit !== undefined ? out.slice(0, filter.limit) : out);
  }

  delete(id: string): Promise<void> {
    this.records.delete(id);
    return Promise.resolve();
  }

  count(): Promise<number> {
    return Promise.resolve(this.records.size);
  }

  /** Snapshot helper for persistence — not part of the port. */
  snapshot(): readonly MemoryRecord[] {
    return [...this.records.values()];
  }

  /** Bulk-restore helper — replaces existing contents. */
  restore(records: readonly MemoryRecord[]): void {
    this.records.clear();
    for (const r of records) this.records.set(r.id, r);
  }
}

/**
 * Type guard for the in-memory memory adapter. Used by snapshot
 * round-trip code (only the in-memory variant supports
 * `snapshot()` / `restore()` directly).
 */
export function isInMemoryMemoryAdapter(m: MemoryRepository): m is InMemoryMemoryAdapter {
  return m instanceof InMemoryMemoryAdapter;
}

function matchesFilter(r: MemoryRecord, f: MemoryFilter): boolean {
  if (f.kinds && !f.kinds.includes(r.kind)) return false;
  if (f.topics && !f.topics.some((t) => r.topics.includes(t))) return false;
  if (f.minImportance !== undefined && r.importance < f.minImportance) return false;
  if (f.minConfidence !== undefined && r.confidence < f.minConfidence) return false;
  if (f.sinceMs !== undefined && r.createdAt < f.sinceMs) return false;
  return true;
}
