/**
 * Generic completion-predicate primitives (Pillar 1, slice 1.1).
 *
 * Each factory returns a `CompletionPredicate` closure. Predicates are
 * pure functions of `TourCtx` — no I/O, no time, no randomness — so
 * they are trivially testable under `ManualClock` + `SeededRng`.
 *
 * Per-chapter predicates (autonomy, trace, switch, JSON, replay) compose
 * these primitives in their owning slice (1.2 / 1.3). Keeping the
 * primitives small + obviously pure means a new chapter's predicate is
 * always a `combineAll(...)` of known leaves.
 */

import type { CompletionPredicate, TourCtx } from './types.js';

/** Always-true predicate. Useful as a safe default in tests. */
export const ALWAYS: CompletionPredicate = () => true;

/** Always-false predicate. Useful for "blocking" steps in tests. */
export const NEVER: CompletionPredicate = () => false;

/**
 * True when the current route's path equals `expected` exactly. Path
 * comparison is byte-exact — callers normalize trailing slashes upstream.
 */
export function onRoute(expected: string): CompletionPredicate {
  return (ctx: TourCtx) => ctx.route.path === expected;
}

/**
 * True when the current route's path starts with `prefix`. Useful for
 * scenario-scoped routes (e.g. `/play/` matches `/play/pet-care`).
 */
export function onRoutePrefix(prefix: string): CompletionPredicate {
  return (ctx: TourCtx) => ctx.route.path.startsWith(prefix);
}

/** True once the active session has advanced to at least `n` ticks. */
export function tickAtLeast(n: number): CompletionPredicate {
  return (ctx: TourCtx) => ctx.session.tickIndex >= n;
}

/** True when the session reports the named cognition mode. */
export function cognitionModeIs(modeId: string): CompletionPredicate {
  return (ctx: TourCtx) => ctx.session.cognitionModeId === modeId;
}

/**
 * True when the session has emitted at least one event of `type` at or
 * after `sinceTick`. Pass `0` to mean "any time since session start".
 */
export function eventEmittedSince(type: string, sinceTick: number): CompletionPredicate {
  return (ctx: TourCtx) =>
    ctx.session.recentEvents.some((e) => e.type === type && e.tickIndex >= sinceTick);
}

/**
 * True when an event of `type` has been emitted at or after the tick the
 * current step started. Used by chapter 2-5 predicates so events
 * emitted before the user reached the step don't auto-complete it.
 */
export function eventEmittedSinceStep(type: string): CompletionPredicate {
  return (ctx: TourCtx) =>
    ctx.session.recentEvents.some((e) => e.type === type && e.tickIndex >= ctx.stepBaselineTick);
}

/**
 * True once at least `n` ticks have elapsed since the current step
 * started. Used to give the user a minimum dwell time on a chapter
 * (e.g. "wait two ticks so you can read the trace") without coupling
 * to absolute tick counts.
 */
export function ticksSinceStepAtLeast(n: number): CompletionPredicate {
  return (ctx: TourCtx) => ctx.session.tickIndex - ctx.stepBaselineTick >= n;
}

/**
 * True when the most recent matching event in `recentEvents` is the
 * "open" type rather than the "close" type. Used to model a binary
 * UI flag (e.g. "trace panel currently visible") through the same
 * event stream that drives the other predicates: the producing
 * component emits `openType` on hidden→visible and `closeType` on
 * visible→hidden, and this predicate scans the buffer in reverse
 * to find the latest of either.
 *
 * Returns `false` if no matching event of either type has been
 * recorded yet (cold-start case). Bounded by the buffer's
 * `RECENT_EVENT_LIMIT` cap on the upstream side.
 */
export function flagOpen(openType: string, closeType: string): CompletionPredicate {
  return (ctx: TourCtx) => {
    const events = ctx.session.recentEvents;
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i];
      if (e === undefined) continue;
      if (e.type === openType) return true;
      if (e.type === closeType) return false;
    }
    return false;
  };
}

/** Logical AND across `predicates`. An empty list returns `true`. */
export function combineAll(...predicates: ReadonlyArray<CompletionPredicate>): CompletionPredicate {
  return (ctx: TourCtx) => predicates.every((p) => p(ctx));
}

/** Logical OR across `predicates`. An empty list returns `false`. */
export function combineAny(...predicates: ReadonlyArray<CompletionPredicate>): CompletionPredicate {
  return (ctx: TourCtx) => predicates.some((p) => p(ctx));
}

/** Logical NOT of `predicate`. */
export function not(predicate: CompletionPredicate): CompletionPredicate {
  return (ctx: TourCtx) => !predicate(ctx);
}
