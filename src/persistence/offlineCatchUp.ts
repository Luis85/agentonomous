import { OFFLINE_CATCHUP_DEFAULTS } from '../cognition/tuning.js';

/**
 * Shared helper for catch-up sub-stepping when restoring an agent after a
 * long offline period. The Agent owns the actual integration in its
 * `restore()` path (M10); this module holds the math + defaults so unit
 * tests can pin the shape.
 *
 * The strategy is straightforward: split a large elapsed virtual-dt into
 * fixed-size chunks and feed each chunk into a user-supplied step function
 * (which wraps a full `agent.tick(chunk / timeScale)` under the hood).
 * Works for any subsystem that respects determinism — a fixed seed + a
 * fixed chunk size produce byte-identical traces.
 */
export type CatchUpOptions = {
  /** Fixed chunk size in virtual seconds. Default: 0.5. */
  chunkVirtualSeconds?: number;
  /** Hard cap on chunks processed per call — guards against pathological deltas. */
  maxChunks?: number;
};

export type CatchUpResult = {
  chunksProcessed: number;
  totalVirtualSeconds: number;
  truncated: boolean;
};

/**
 * Split `totalVirtualDtSeconds` into fixed chunks and invoke `step` for each.
 * Returns a summary with whether the `maxChunks` ceiling was hit.
 *
 * `step` is async to accommodate real tick pipelines that await ports.
 */
export async function runCatchUp(
  totalVirtualDtSeconds: number,
  step: (chunkSeconds: number, index: number) => Promise<void>,
  opts: CatchUpOptions = {},
): Promise<CatchUpResult> {
  const chunkSize = opts.chunkVirtualSeconds ?? OFFLINE_CATCHUP_DEFAULTS.chunkVirtualSeconds;
  const maxChunks = opts.maxChunks ?? OFFLINE_CATCHUP_DEFAULTS.maxChunks;

  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new RangeError(
      `runCatchUp: chunkVirtualSeconds must be a positive finite number, got ${String(chunkSize)}`,
    );
  }
  if (!Number.isInteger(maxChunks) || maxChunks <= 0) {
    throw new RangeError(
      `runCatchUp: maxChunks must be a positive integer, got ${String(maxChunks)}`,
    );
  }

  if (!(totalVirtualDtSeconds > 0)) {
    return { chunksProcessed: 0, totalVirtualSeconds: 0, truncated: false };
  }

  let remaining = totalVirtualDtSeconds;
  let processed = 0;

  while (remaining > 0 && processed < maxChunks) {
    const chunk = Math.min(remaining, chunkSize);
    await step(chunk, processed);
    remaining -= chunk;
    processed += 1;
  }

  return {
    chunksProcessed: processed,
    totalVirtualSeconds: totalVirtualDtSeconds - remaining,
    truncated: remaining > 0,
  };
}
