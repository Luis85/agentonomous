/**
 * Walkthrough domain barrel (Pillar 1, slice 1.1).
 *
 * Public surface for `stores/view/useTourProgress` (slice 1.2) and the
 * chapter content modules added in slices 1.2 / 1.3. Per the design's
 * DDD forbidden-import table, only `stores/domain/` and `stores/view/`
 * import from here — components and views go through the store layer.
 */

export type {
  AgentSessionSnapshot,
  ChapterId,
  CompletionPredicate,
  RouteContext,
  SelectorHandle,
  SessionEvent,
  TourCtx,
  TourEnd,
  WalkthroughStep,
  WalkthroughStepId,
} from './types.js';
export { TOUR_END, selectorHandle, walkthroughStepId } from './types.js';

export {
  ALWAYS,
  NEVER,
  cognitionModeIs,
  combineAll,
  combineAny,
  eventEmittedSince,
  not,
  onRoute,
  onRoutePrefix,
  tickAtLeast,
} from './predicates.js';

export type { WalkthroughGraph } from './graph.js';
export {
  WalkthroughGraphError,
  defineWalkthroughGraph,
  getChapterSteps,
  getNextStep,
  getSkipTarget,
  getStepById,
} from './graph.js';
