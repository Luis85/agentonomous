/**
 * Chapter 2 — Trace visibility. The user opens the decision-trace panel
 * and watches a tick refresh through it.
 *
 * Two-step shape so the predicate doesn't auto-complete on a stale
 * panel-state from before the user reached the chapter:
 *
 *   1. **trace-open** — wait for `<TracePanel>` to publish the
 *      synthetic `TracePanelOpened` UI event since this step started.
 *      The panel emits it via `useAgentSession.recordUiEvent` whenever
 *      the toggle goes from hidden → visible.
 *   2. **trace-observe** — give the user one more tick on the open
 *      panel so the trace they're looking at is the result of the
 *      reasoner running, not the cold-start zero state.
 */

import { combineAll, eventEmittedSinceStep, ticksSinceStepAtLeast } from '../predicates.js';
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
  completionPredicate: eventEmittedSinceStep('TracePanelOpened'),
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
