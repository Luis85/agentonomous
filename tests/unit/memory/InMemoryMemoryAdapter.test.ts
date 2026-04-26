import { describe, expect, it } from 'vitest';
import { InMemoryMemoryAdapter } from '../../../src/memory/InMemoryMemoryAdapter.js';
import type { MemoryRecord } from '../../../src/memory/MemoryRecord.js';

function rec(overrides: Partial<MemoryRecord>): MemoryRecord {
  return {
    id: overrides.id ?? 'rec',
    kind: 'episodic',
    agentId: 'pet',
    createdAt: 0,
    importance: 0.5,
    confidence: 0.8,
    topics: [],
    body: '',
    ...overrides,
  };
}

describe('InMemoryMemoryAdapter', () => {
  it('saves, gets, counts, and deletes', async () => {
    const m = new InMemoryMemoryAdapter();
    expect(await m.count()).toBe(0);
    await m.save(rec({ id: 'a' }));
    await m.save(rec({ id: 'b' }));
    expect(await m.count()).toBe(2);
    expect((await m.get('a'))?.id).toBe('a');
    expect(await m.get('missing')).toBeNull();
    await m.delete('a');
    expect(await m.count()).toBe(1);
  });

  it('query filters by kind', async () => {
    const m = new InMemoryMemoryAdapter();
    await m.save(rec({ id: '1', kind: 'semantic' }));
    await m.save(rec({ id: '2', kind: 'episodic' }));
    const result = await m.query({ kinds: ['semantic'] });
    expect(result.map((r) => r.id)).toEqual(['1']);
  });

  it('query filters by topic (any-match)', async () => {
    const m = new InMemoryMemoryAdapter();
    await m.save(rec({ id: '1', topics: ['trade'] }));
    await m.save(rec({ id: '2', topics: ['combat'] }));
    await m.save(rec({ id: '3', topics: ['trade', 'player'] }));
    const result = await m.query({ topics: ['trade'] });
    expect(result.map((r) => r.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
      '1',
      '3',
    ]);
  });

  it('query sorts descending by createdAt and applies limit', async () => {
    const m = new InMemoryMemoryAdapter();
    await m.save(rec({ id: '1', createdAt: 100 }));
    await m.save(rec({ id: '2', createdAt: 300 }));
    await m.save(rec({ id: '3', createdAt: 200 }));
    const result = await m.query({ limit: 2 });
    expect(result.map((r) => r.id)).toEqual(['2', '3']);
  });

  it('query respects importance + confidence floors', async () => {
    const m = new InMemoryMemoryAdapter();
    await m.save(rec({ id: 'low', importance: 0.2, confidence: 0.9 }));
    await m.save(rec({ id: 'high', importance: 0.9, confidence: 0.9 }));
    const result = await m.query({ minImportance: 0.5 });
    expect(result.map((r) => r.id)).toEqual(['high']);
  });

  it('snapshot + restore preserves records', async () => {
    const m = new InMemoryMemoryAdapter();
    await m.save(rec({ id: 'a' }));
    await m.save(rec({ id: 'b' }));
    const snap = m.snapshot();
    const copy = new InMemoryMemoryAdapter();
    copy.restore(snap);
    expect(await copy.count()).toBe(2);
    expect((await copy.get('a'))?.id).toBe('a');
  });
});
