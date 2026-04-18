import { describe, expect, it, vi } from 'vitest';
import { runCatchUp } from '../../../src/persistence/offlineCatchUp.js';

describe('runCatchUp', () => {
  it('splits dt into fixed chunks', async () => {
    const step = vi.fn().mockResolvedValue(undefined);
    const result = await runCatchUp(2, step, { chunkVirtualSeconds: 0.5 });

    expect(step).toHaveBeenCalledTimes(4);
    expect(result.chunksProcessed).toBe(4);
    expect(result.truncated).toBe(false);
  });

  it('handles partial final chunk', async () => {
    const seen: number[] = [];
    await runCatchUp(
      1.1,
      (dt) => {
        seen.push(dt);
        return Promise.resolve();
      },
      { chunkVirtualSeconds: 0.5 },
    );

    expect(seen).toHaveLength(3);
    expect(seen[0]).toBeCloseTo(0.5);
    expect(seen[1]).toBeCloseTo(0.5);
    expect(seen[2]).toBeCloseTo(0.1);
  });

  it('respects maxChunks ceiling', async () => {
    const step = vi.fn().mockResolvedValue(undefined);
    const result = await runCatchUp(100, step, { chunkVirtualSeconds: 0.5, maxChunks: 3 });
    expect(result.chunksProcessed).toBe(3);
    expect(result.truncated).toBe(true);
  });

  it('no-ops on zero or negative dt', async () => {
    const step = vi.fn().mockResolvedValue(undefined);
    const r1 = await runCatchUp(0, step);
    expect(r1.chunksProcessed).toBe(0);
    const r2 = await runCatchUp(-5, step);
    expect(r2.chunksProcessed).toBe(0);
    expect(step).not.toHaveBeenCalled();
  });
});
