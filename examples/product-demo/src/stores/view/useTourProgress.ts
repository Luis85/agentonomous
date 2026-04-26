import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
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
  const lastStep = ref<WalkthroughStepId>(
    (persisted?.lastStep as WalkthroughStepId | undefined) ?? graph.firstStepId,
  );
  const completedAt = ref<number | null>(persisted?.completedAt ?? null);
  const skipped = ref<WalkthroughStepId[]>((persisted?.skipped ?? []) as WalkthroughStepId[]);

  const currentStep = computed<WalkthroughStep | null>(() => {
    if (completedAt.value !== null) return null;
    return graph.stepsById.get(lastStep.value) ?? null;
  });

  const tourCtx = computed<TourCtx>(() => ({
    session: session.sessionSnapshot,
    route: projectRoute(route),
  }));

  function persist(): void {
    writePersisted({
      lastStep: lastStep.value,
      completedAt: completedAt.value,
      skipped: skipped.value,
    });
  }

  function start(): void {
    lastStep.value = graph.firstStepId;
    completedAt.value = null;
    skipped.value = [];
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
    }
    persist();
  }

  function restart(): void {
    completedAt.value = null;
    skipped.value = [];
    lastStep.value = graph.firstStepId;
    clearPersisted();
  }

  /** Force-mark a step complete (e.g. tests). Advances the cursor. */
  function markComplete(stepId: WalkthroughStepId): void {
    const step = graph.stepsById.get(stepId);
    if (step === undefined) return;
    if (step.nextOnComplete === 'end') {
      completedAt.value = Date.now();
    } else {
      lastStep.value = step.nextOnComplete;
    }
    persist();
  }

  return {
    lastStep,
    completedAt,
    skipped,
    currentStep,
    tourCtx,
    start,
    next,
    skip,
    restart,
    markComplete,
  };
});
