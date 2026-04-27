/**
 * Chapter 2 — Trace visibility. The user opens the decision-trace panel
 * and watches a tick refresh through it.
 *
 * Two-step shape so a stale paused frame from before the chapter
 * doesn't fast-forward the user past the dwell-tick observe step:
 *
 *   1. **trace-open** — `flagOpen('TracePanelOpened', 'TracePanelClosed')`
 *      checks the most recent matching event in the session buffer. The
 *      panel emits `TracePanelOpened` on hidden→visible (and on mount
 *      when restored visible), `TracePanelClosed` on visible→hidden,
 *      so the predicate models "panel currently visible" through the
 *      shared event stream. Returning users with the panel restored
 *      visible advance without a forced extra toggle; users who
 *      open-then-close the panel before the chapter still need to
 *      re-open it on chapter-2 itself.
 *   2. **trace-observe** — give the user one more tick on the open
 *      panel so the trace they're looking at is the result of the
 *      reasoner running, not the cold-start zero state. This stays
 *      step-scoped because the dwell semantics are about elapsed
 *      time after the user reached this step, not session totals.
 */

import {
  combineAll,
  eventEmittedSinceStep,
  flagOpen,
  ticksSinceStepAtLeast,
} from '../predicates.js';
import type { WalkthroughStep } from '../types.js';
import {
  STEP_ID_COGNITION_SWAP,
  STEP_ID_TRACE_OBSERVE,
  STEP_ID_TRACE_OPEN,
  tourCopy,
} from '../../../copy/tour.js';
import { registeredHandle } from '../../../stores/view/selectorHandles.js';

const TRACE_PANEL_HANDLE = registeredHandle('trace.panel');
const OBSERVE_DWELL_TICKS = 1;

const traceOpenCopy = tourCopy[STEP_ID_TRACE_OPEN];
const traceObserveCopy = tourCopy[STEP_ID_TRACE_OBSERVE];
if (traceOpenCopy === undefined || traceObserveCopy === undefined) {
  throw new Error('Missing tour copy entry for chapter-2 steps');
}

const traceOpenStep: WalkthroughStep = {
  id: STEP_ID_TRACE_OPEN,
  chapter: 2,
  title: traceOpenCopy.title,
  hint: traceOpenCopy.hint,
  highlight: TRACE_PANEL_HANDLE,
  completionPredicate: flagOpen('TracePanelOpened', 'TracePanelClosed'),
  nextOnComplete: STEP_ID_TRACE_OBSERVE,
};

const traceObserveStep: WalkthroughStep = {
  id: STEP_ID_TRACE_OBSERVE,
  chapter: 2,
  title: traceObserveCopy.title,
  hint: traceObserveCopy.hint,
  highlight: TRACE_PANEL_HANDLE,
  // Combine: real tick AND the user has stayed on this step long enough
  // for that tick to actually refresh the trace.
  completionPredicate: combineAll(
    eventEmittedSinceStep('AgentTicked'),
    ticksSinceStepAtLeast(OBSERVE_DWELL_TICKS),
  ),
  nextOnComplete: STEP_ID_COGNITION_SWAP,
};

export const chapter2Steps: ReadonlyArray<WalkthroughStep> = [traceOpenStep, traceObserveStep];
