/**
 * Walkthrough step-graph builder + traversal helpers (Pillar 1, slice 1.1).
 *
 * `defineWalkthroughGraph` validates the supplied steps once at construction
 * (every `nextOnComplete` either resolves to a known step id or is the
 * `TOUR_END` sentinel; ids are unique). The returned `WalkthroughGraph` is
 * frozen — downstream pillars treat it as a read-only constant.
 *
 * Traversal helpers are pure functions of the graph + a `TourCtx`, so the
 * Pinia view store added in slice 1.2 can drive them under
 * `@pinia/testing` without booting an `Agent`.
 */

import { TOUR_END } from './types.js';
import type { ChapterId, TourCtx, TourEnd, WalkthroughStep, WalkthroughStepId } from './types.js';

/**
 * Immutable, validated step graph. Construct via `defineWalkthroughGraph`;
 * the constructor never returns a partially-built graph on a validation
 * failure — it throws.
 */
export type WalkthroughGraph = {
  readonly steps: ReadonlyArray<WalkthroughStep>;
  readonly stepsById: ReadonlyMap<WalkthroughStepId, WalkthroughStep>;
  readonly chapters: ReadonlyMap<ChapterId, ReadonlyArray<WalkthroughStep>>;
  readonly firstStepId: WalkthroughStepId;
};

/** Thrown by `defineWalkthroughGraph` when steps fail structural validation. */
export class WalkthroughGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalkthroughGraphError';
  }
}

/**
 * Build a frozen graph from `steps`. Validates:
 *
 *  1. `steps` is non-empty.
 *  2. Every step id is unique (duplicates are an authoring bug).
 *  3. Every `nextOnComplete` is either `TOUR_END` or references a known id.
 *  4. Steps are grouped by chapter in declaration order; the first step is
 *     used as the cold-start cursor.
 */
export function defineWalkthroughGraph(steps: ReadonlyArray<WalkthroughStep>): WalkthroughGraph {
  if (steps.length === 0) {
    throw new WalkthroughGraphError('walkthrough graph must contain at least one step');
  }

  const stepsById = new Map<WalkthroughStepId, WalkthroughStep>();
  for (const step of steps) {
    // The literal string `TOUR_END` ('end') is the terminal sentinel returned
    // by `getNextStep` / `getSkipTarget`. A step authored with `id === 'end'`
    // would silently shadow the sentinel — every transition meant to land on
    // it would instead be interpreted as tour completion, and the step would
    // be unreachable. Reject the collision at construction time.
    if ((step.id as string) === TOUR_END) {
      throw new WalkthroughGraphError(
        `step id "${String(step.id)}" collides with the reserved TOUR_END sentinel`,
      );
    }
    if (stepsById.has(step.id)) {
      throw new WalkthroughGraphError(`duplicate walkthrough step id: ${String(step.id)}`);
    }
    stepsById.set(step.id, step);
  }

  for (const step of steps) {
    if (step.nextOnComplete === TOUR_END) continue;
    if (!stepsById.has(step.nextOnComplete)) {
      throw new WalkthroughGraphError(
        `step "${String(step.id)}" advances to unknown step "${String(step.nextOnComplete)}"`,
      );
    }
  }

  // Reachability/termination check: from every step, the `nextOnComplete`
  // chain must terminate at `TOUR_END`. Each step has exactly one successor,
  // so a chain that revisits a step before hitting `TOUR_END` is a cycle —
  // skipping or naturally completing along that chain would trap the user
  // forever. Walk every step to be defensive against multi-entry-point
  // graphs (slice 1.3 may use `getStepById` to jump to chapters 2-5's start
  // ids without traversing chapter 1 first).
  for (const startId of stepsById.keys()) {
    const visited = new Set<WalkthroughStepId>();
    let cursor: WalkthroughStepId | TourEnd = startId;
    while (cursor !== TOUR_END) {
      if (visited.has(cursor)) {
        throw new WalkthroughGraphError(
          `walkthrough graph contains a cycle reachable from "${String(startId)}" (re-enters "${String(cursor)}")`,
        );
      }
      visited.add(cursor);
      const step = stepsById.get(cursor);
      // The earlier `nextOnComplete` validation guarantees this lookup
      // succeeds; the explicit guard keeps the runtime error specific
      // instead of a misleading `undefined.nextOnComplete`.
      if (step === undefined) {
        throw new WalkthroughGraphError(
          `walkthrough graph references unknown step id "${String(cursor)}" while traversing from "${String(startId)}"`,
        );
      }
      cursor = step.nextOnComplete;
    }
  }

  const chapters = new Map<ChapterId, WalkthroughStep[]>();
  for (const step of steps) {
    const bucket = chapters.get(step.chapter) ?? [];
    bucket.push(step);
    chapters.set(step.chapter, bucket);
  }

  // Freeze each chapter bucket so downstream consumers cannot mutate.
  const frozenChapters = new Map<ChapterId, ReadonlyArray<WalkthroughStep>>();
  for (const [chapter, bucket] of chapters) {
    frozenChapters.set(chapter, Object.freeze(bucket));
  }

  // The first declared step is the cold-start cursor (spec P1-FR-1, P1-FR-6).
  // We assert non-undefined because we already checked `steps.length > 0` above.
  const firstStep = steps[0];
  if (firstStep === undefined) {
    throw new WalkthroughGraphError('walkthrough graph must contain at least one step');
  }

  return Object.freeze({
    steps: Object.freeze([...steps]),
    stepsById,
    chapters: frozenChapters,
    firstStepId: firstStep.id,
  });
}

/** Look up a step by id. Returns `undefined` when the id is unknown. */
export function getStepById(
  graph: WalkthroughGraph,
  id: WalkthroughStepId,
): WalkthroughStep | undefined {
  return graph.stepsById.get(id);
}

/** Steps registered for `chapter`, in declaration order. Empty array if none. */
export function getChapterSteps(
  graph: WalkthroughGraph,
  chapter: ChapterId,
): ReadonlyArray<WalkthroughStep> {
  return graph.chapters.get(chapter) ?? [];
}

/**
 * Resolve the next step given the current cursor and a `TourCtx`.
 *
 * Returns:
 *  - `'end'` when the current step's predicate is satisfied AND its
 *    `nextOnComplete` is `TOUR_END`;
 *  - the next `WalkthroughStep` when the predicate is satisfied and the
 *    step has a successor;
 *  - `undefined` when the predicate is NOT yet satisfied (the caller
 *    keeps the cursor where it is).
 *
 * Throws `WalkthroughGraphError` if `currentId` is not in the graph —
 * this is a programming error, not a tour state.
 */
export function getNextStep(
  graph: WalkthroughGraph,
  currentId: WalkthroughStepId,
  ctx: TourCtx,
): WalkthroughStep | TourEnd | undefined {
  const current = graph.stepsById.get(currentId);
  if (current === undefined) {
    throw new WalkthroughGraphError(`unknown current step id: ${String(currentId)}`);
  }

  if (!current.completionPredicate(ctx)) return undefined;

  if (current.nextOnComplete === TOUR_END) return TOUR_END;

  const next = graph.stepsById.get(current.nextOnComplete);
  if (next === undefined) {
    // Validation in `defineWalkthroughGraph` should have caught this; the
    // re-check here keeps the runtime error specific instead of returning a
    // misleading `undefined`.
    throw new WalkthroughGraphError(
      `step "${String(current.id)}" references unknown next step "${String(current.nextOnComplete)}"`,
    );
  }
  return next;
}

/**
 * Skip the current step regardless of its predicate. Returns the next
 * step (or `'end'`), or `undefined` if `currentId` is the final step
 * with `nextOnComplete: TOUR_END` — callers treat `undefined` from skip
 * the same as completion.
 *
 * Skip never re-evaluates the predicate; spec P1-FR-5 makes the skip
 * explicit so a stuck predicate cannot trap the user.
 */
export function getSkipTarget(
  graph: WalkthroughGraph,
  currentId: WalkthroughStepId,
): WalkthroughStep | TourEnd {
  const current = graph.stepsById.get(currentId);
  if (current === undefined) {
    throw new WalkthroughGraphError(`unknown current step id: ${String(currentId)}`);
  }
  if (current.nextOnComplete === TOUR_END) return TOUR_END;
  const next = graph.stepsById.get(current.nextOnComplete);
  if (next === undefined) {
    throw new WalkthroughGraphError(
      `step "${String(current.id)}" references unknown next step "${String(current.nextOnComplete)}"`,
    );
  }
  return next;
}
