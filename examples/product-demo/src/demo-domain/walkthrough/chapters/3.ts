/**
 * Chapter 3 — Cognition switching. The user picks a different cognition
 * mode (Behaviour Tree, BDI, or Learning) and watches Whiskers reach
 * its next decision through that mode.
 *
 * Two-step shape:
 *
 *   1. **cognition-swap** — wait for `useAgentSession.cognitionModeId`
 *      to leave the default `'heuristic'`. The HUD's cognition picker
 *      calls `useAgentSession.setCognitionMode(...)`, which probes the
 *      peer dep, constructs the new reasoner, and assigns it to the
 *      live agent before flipping `cognitionModeId`. (The full Pillar-2
 *      slice 2.5 swaps the placeholder picker for the legacy
 *      cognitionSwitcher with its loss sparkline + prediction strip.)
 *   2. **cognition-observe** — give the new reasoner one tick to make
 *      a decision so the trace panel shows it picking under the new
 *      mode, not the cold-start fallback.
 */

import {
  combineAll,
  eventEmittedSinceStep,
  not,
  cognitionModeIs,
  ticksSinceStepAtLeast,
} from '../predicates.js';
import type { WalkthroughStep } from '../types.js';
import {
  STEP_ID_COGNITION_OBSERVE,
  STEP_ID_COGNITION_SWAP,
  STEP_ID_JSON_PREVIEW,
  tourCopy,
} from '../../../copy/tour.js';
import { registeredHandle } from '../../../stores/view/selectorHandles.js';

const COGNITION_TOGGLE_HANDLE = registeredHandle('hud.cognition.toggle');
const COGNITION_INDICATOR_HANDLE = registeredHandle('hud.cognition.indicator');

const swapCopy = tourCopy[STEP_ID_COGNITION_SWAP];
const observeCopy = tourCopy[STEP_ID_COGNITION_OBSERVE];
if (swapCopy === undefined || observeCopy === undefined) {
  throw new Error('Missing tour copy entry for chapter-3 steps');
}

const cognitionSwapStep: WalkthroughStep = {
  id: STEP_ID_COGNITION_SWAP,
  chapter: 3,
  title: swapCopy.title,
  hint: swapCopy.hint,
  highlight: COGNITION_TOGGLE_HANDLE,
  // Any non-default mode counts. We don't pin to a specific peer
  // (mistreevous / js-son / tfjs may or may not be installed locally).
  completionPredicate: not(cognitionModeIs('heuristic')),
  nextOnComplete: STEP_ID_COGNITION_OBSERVE,
};

const cognitionObserveStep: WalkthroughStep = {
  id: STEP_ID_COGNITION_OBSERVE,
  chapter: 3,
  title: observeCopy.title,
  hint: observeCopy.hint,
  highlight: COGNITION_INDICATOR_HANDLE,
  // Both: an `AgentTicked` event AND virtual time has actually
  // advanced since the cursor entered this step. `useAgentSession`
  // still emits `AgentTicked` at `timeScale === 0` (so the trace
  // panel keeps observing paused frames), but `tickIndex` does not
  // increment. Without the dwell-tick gate, the chapter could
  // auto-complete while the simulation is paused — the user would
  // never see a real post-switch decision tick.
  completionPredicate: combineAll(eventEmittedSinceStep('AgentTicked'), ticksSinceStepAtLeast(1)),
  nextOnComplete: STEP_ID_JSON_PREVIEW,
};

export const chapter3Steps: ReadonlyArray<WalkthroughStep> = [
  cognitionSwapStep,
  cognitionObserveStep,
];
