import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';
import { useAgentSession } from '../domain/useAgentSession.js';
import { useWalkthroughGraph } from '../../composables/useWalkthroughGraph.js';
import type {
  RouteContext,
  TourCtx,
  WalkthroughStep,
  WalkthroughStepId,
} from '../../demo-domain/walkthrough/types.js';

const PROGRESS_STORAGE_KEY = 'demo.v2.tour.progress';

type PersistedProgress = {
  readonly lastStep: string;
  readonly completedAt: number | null;
  readonly skipped: ReadonlyArray<string>;
  readonly baselineTickIndex: number;
};

function readPersisted(): PersistedProgress | null {
  try {
    const raw = globalThis.localStorage?.getItem(PROGRESS_STORAGE_KEY);
    if (typeof raw !== 'string' || raw.length === 0) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedProgress>;
    if (typeof parsed.lastStep !== 'string') return null;
    return {
      lastStep: parsed.lastStep,
      completedAt: typeof parsed.completedAt === 'number' ? parsed.completedAt : null,
      skipped: Array.isArray(parsed.skipped)
        ? parsed.skipped.filter((s) => typeof s === 'string')
        : [],
      baselineTickIndex:
        typeof parsed.baselineTickIndex === 'number' ? parsed.baselineTickIndex : 0,
    };
  } catch {
    return null;
  }
}

function writePersisted(progress: PersistedProgress): void {
  try {
    globalThis.localStorage?.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // localStorage unavailable (private mode, quota); silently skip.
  }
}

function clearPersisted(): void {
  try {
    globalThis.localStorage?.removeItem(PROGRESS_STORAGE_KEY);
  } catch {
    // localStorage unavailable; silently skip.
  }
}

/** Project a vue-router `RouteLocationNormalizedLoaded` into the domain `RouteContext`. */
function projectRoute(route: RouteLocationNormalizedLoaded): RouteContext {
  const scenarioRaw = route.params['scenarioId'];
  const stepRaw = route.params['step'];
  return {
    path: route.path,
    scenarioId: typeof scenarioRaw === 'string' ? scenarioRaw : null,
    tourStep: typeof stepRaw === 'string' ? (stepRaw as WalkthroughStepId) : null,
  };
}

/**
 * View store tracking the user's progress through the guided
 * walkthrough (Pillar 1). Holds:
 *
 *  - `lastStep`     — current cursor (resumable across reloads).
 *  - `completedAt`  — wall ms when the tour ended (null = in progress).
 *  - `skipped[]`    — step ids the user skipped past via `skip()`.
 *
 * Reads `useAgentSession.sessionSnapshot` + the active `useRoute` to
 * build a `TourCtx` for predicate evaluation. Persists the trio under
 * `demo.v2.tour.progress`.
 */
export const useTourProgress = defineStore('tourProgress', () => {
  const session = useAgentSession();
  const graph = useWalkthroughGraph();
  const route = useRoute();

  const persisted = readPersisted();
  // Validate the persisted cursor against the active graph. A renamed /
  // removed step id (or any garbage in `demo.v2.tour.progress`) used to
  // leave `currentStep === null` while `completedAt` stayed null,
  // which froze `next()` / `skip()` and stopped the tour from rendering
  // — users had to clear localStorage by hand to recover. Falling back
  // to `firstStepId` keeps the guided flow recoverable across
  // step-id renames between releases.
  const restoredStep: WalkthroughStepId =
    persisted !== null && graph.stepsById.has(persisted.lastStep as WalkthroughStepId)
      ? (persisted.lastStep as WalkthroughStepId)
      : graph.firstStepId;
  const lastStep = ref<WalkthroughStepId>(restoredStep);
  const completedAt = ref<number | null>(persisted?.completedAt ?? null);
  const skipped = ref<WalkthroughStepId[]>((persisted?.skipped ?? []) as WalkthroughStepId[]);
  // Tick index captured when the cursor entered the current step.
  // Drives `eventEmittedSinceStep` / `ticksSinceStepAtLeast` predicates
  // so chapter 2-5 conditions don't auto-complete from events that
  // fired before the user reached the step. Persisted alongside the
  // cursor so a reload mid-step doesn't reset the baseline (which
  // would make e.g. "wait 3 ticks" succeed instantly on resume).
  //
  // On a hard reload `PlayView` calls `session.init(...)` which sets
  // `session.tickIndex` back to 0, but the persisted baseline still
  // reflects the pre-reload tick counter. Clamp the restored value
  // to the current session tick so chapters 2-5 don't reject valid
  // post-reload events while waiting for the counter to catch up to
  // a stale baseline.
  const restoredBaseline = persisted?.baselineTickIndex ?? 0;
  const baselineTickIndex = ref<number>(Math.min(restoredBaseline, session.tickIndex));

  // `useAgentSession.replayFromSnapshot` resets `tickIndex` to 0 and
  // wipes `recentEvents`. After that, every event in the buffer carries
  // a tickIndex < the pre-reset baseline, so chapter-5 step "replay-import"
  // would never fire on `eventEmittedSinceStep('SnapshotImported')`.
  // Detect the reset (tickIndex falling) and rebase the baseline. The
  // rebase is persisted immediately so a page reload before the next
  // explicit advance/skip/restart doesn't restore the stale pre-reset
  // baseline from `demo.v2.tour.progress`.
  watch(
    () => session.tickIndex,
    (next, prev) => {
      if (next < prev) {
        baselineTickIndex.value = next;
        persist();
      }
    },
  );

  const currentStep = computed<WalkthroughStep | null>(() => {
    if (completedAt.value !== null) return null;
    return graph.stepsById.get(lastStep.value) ?? null;
  });

  const tourCtx = computed<TourCtx>(() => ({
    session: session.sessionSnapshot,
    route: projectRoute(route),
    stepBaselineTick: baselineTickIndex.value,
  }));

  function persist(): void {
    writePersisted({
      lastStep: lastStep.value,
      completedAt: completedAt.value,
      skipped: skipped.value,
      baselineTickIndex: baselineTickIndex.value,
    });
  }

  function start(): void {
    lastStep.value = graph.firstStepId;
    completedAt.value = null;
    skipped.value = [];
    baselineTickIndex.value = session.tickIndex;
    persist();
  }

  /**
   * Advance the cursor if the current step's predicate is satisfied.
   * Returns `true` when the cursor moved (or the tour ended). Called
   * from `<TourOverlay>` on every `tickIndex` change; safe to call
   * when no step is active (no-op).
   */
  function next(): boolean {
    const step = currentStep.value;
    if (step === null) return false;
    if (!step.completionPredicate(tourCtx.value)) return false;
    if (step.nextOnComplete === 'end') {
      completedAt.value = Date.now();
    } else {
      lastStep.value = step.nextOnComplete;
      baselineTickIndex.value = session.tickIndex;
    }
    persist();
    return true;
  }

  /**
   * Skip the current step regardless of predicate. Records the skip
   * + advances the cursor so a stuck predicate cannot trap the user
   * (P1-FR-5).
   */
  function skip(): void {
    const step = currentStep.value;
    if (step === null) return;
    if (!skipped.value.includes(step.id)) skipped.value.push(step.id);
    if (step.nextOnComplete === 'end') {
      completedAt.value = Date.now();
    } else {
      lastStep.value = step.nextOnComplete;
      baselineTickIndex.value = session.tickIndex;
    }
    persist();
  }

  /**
   * Skip the entire remainder of the tour in one shot. Walks the chain
   * from `lastStep` to the `'end'` sentinel, recording every visited
   * step in `skipped`, then sets `completedAt` so `<TourOverlay>`
   * disappears. Used by the intro view's "Skip to free play" CTA so
   * users who opt out don't see the overlay pop on every chapter.
   * Bounded by the graph's step count to short-circuit any future
   * cyclic-graph mistake.
   */
  function complete(): void {
    if (completedAt.value !== null) return;
    const limit = graph.stepsById.size;
    let cursor: WalkthroughStepId | 'end' = lastStep.value;
    for (let i = 0; i < limit; i += 1) {
      if (cursor === 'end') break;
      if (!skipped.value.includes(cursor)) skipped.value.push(cursor);
      const step = graph.stepsById.get(cursor);
      if (step === undefined) break;
      cursor = step.nextOnComplete;
    }
    completedAt.value = Date.now();
    persist();
  }

  function restart(): void {
    completedAt.value = null;
    skipped.value = [];
    lastStep.value = graph.firstStepId;
    baselineTickIndex.value = session.tickIndex;
    clearPersisted();
  }

  /**
   * URL representation of the active step (`/tour/<step-id>`). Returns
   * `null` when the tour has completed or the cursor is in an unknown
   * state, so callers can choose between pushing the route and leaving
   * the user on whatever non-tour route they were viewing.
   */
  const currentStepRoutePath = computed<string | null>(() => {
    const step = currentStep.value;
    return step === null ? null : `/tour/${step.id}`;
  });

  /**
   * Push the active step's URL onto the router if it differs from the
   * current location. No-op when the tour has completed (so a final
   * `/tour/<last-step>` doesn't get rewritten on completion).
   */
  async function syncRoute(router: Router): Promise<void> {
    const next = currentStepRoutePath.value;
    if (next === null) return;
    const here = router.currentRoute.value.fullPath;
    if (here === next) return;
    // The route is declared as `/tour/:step?` so the bare `/tour`
    // (bookmarked / hand-typed) is also a tour entry. Match both
    // `/tour` and any `/tour/<step>` variant before pushing — only
    // bail on truly non-tour routes (e.g. `/play`).
    if (here !== '/tour' && !here.startsWith('/tour/')) return;
    await router.push(next);
  }

  /**
   * Fast-forward the cursor to a step id supplied by the URL. Forward-
   * only: a hard-load at `/tour/<earlier-step>` does NOT rewind past
   * the persisted progress, so the URL can deep-link to "where we left
   * off" without giving up the resume contract.
   */
  function resumeFromRoute(stepId: string): void {
    const candidate = stepId as WalkthroughStepId;
    if (!graph.stepsById.has(candidate)) return;
    if (completedAt.value !== null) return;
    if (lastStep.value === candidate) return;
    // Forward-only: walk the persisted step's `nextOnComplete` chain;
    // adopt the URL step only if it is reachable from the persisted
    // cursor without going backwards. Bounded by the graph's step count
    // so a cyclic graph cannot infinite-loop here.
    const limit = graph.stepsById.size;
    let cursor: WalkthroughStepId | 'end' = lastStep.value;
    for (let i = 0; i < limit; i += 1) {
      if (cursor === 'end') return;
      if (cursor === candidate) {
        lastStep.value = candidate;
        baselineTickIndex.value = session.tickIndex;
        persist();
        return;
      }
      const step = graph.stepsById.get(cursor);
      if (step === undefined) return;
      cursor = step.nextOnComplete;
    }
  }

  /** Force-mark a step complete (e.g. tests). Advances the cursor. */
  function markComplete(stepId: WalkthroughStepId): void {
    const step = graph.stepsById.get(stepId);
    if (step === undefined) return;
    if (step.nextOnComplete === 'end') {
      completedAt.value = Date.now();
    } else {
      lastStep.value = step.nextOnComplete;
      baselineTickIndex.value = session.tickIndex;
    }
    persist();
  }

  return {
    lastStep,
    completedAt,
    skipped,
    baselineTickIndex,
    currentStep,
    currentStepRoutePath,
    tourCtx,
    start,
    next,
    skip,
    restart,
    complete,
    markComplete,
    syncRoute,
    resumeFromRoute,
  };
});
