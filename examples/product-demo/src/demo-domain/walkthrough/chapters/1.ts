/**
 * Chapter 1 — autonomy. The agent acts on its own.
 *
 * The single shipped step waits for the demo to advance enough ticks
 * AND emit at least one `AGENT_TICKED` event since session start. That
 * combination proves the rAF / virtual-clock pipeline is alive AND the
 * reasoner is producing decisions — both are required to demo
 * "autonomous" behaviour. Predicate primitives come from slice 1.1.
 *
 * Subsequent chapters (2-5) fan out in slice 1.3.
 */

import { AGENT_TICKED } from 'agentonomous';
import { combineAll, eventEmittedSince, tickAtLeast } from '../predicates.js';
import { TOUR_END, selectorHandle } from '../types.js';
import type { WalkthroughStep } from '../types.js';
import { STEP_ID_AUTONOMY, tourCopy } from '../../../copy/tour.js';

/**
 * Logical UI handle for the HUD's needs panel. The HUD component
 * (`<HudPanel>`) registers this handle on mount so `<StepHighlight>`
 * can resolve a real DOM element to outline. Slice 1.3 generalises
 * the registration into a typed `useSelectorRegistry` mirror; for
 * now the handle is a plain branded string and the registry stub in
 * `stores/view/useSelectorRegistry.ts` does the lookup.
 */
const HUD_NEEDS_HANDLE = selectorHandle('hud.needs');

/** Number of agent ticks required before chapter-1 advances. */
const AUTONOMY_TICK_THRESHOLD = 3;

const autonomyCopy = tourCopy[STEP_ID_AUTONOMY];
if (autonomyCopy === undefined) {
  // Authoring invariant: every step id in chapter-1 has a copy entry in
  // `src/copy/tour.ts`. The throw turns an out-of-sync edit into a
  // module-load error instead of a runtime undefined-property crash.
  throw new Error(`Missing tour copy for chapter-1 step "${String(STEP_ID_AUTONOMY)}"`);
}

const autonomyStep: WalkthroughStep = {
  id: STEP_ID_AUTONOMY,
  chapter: 1,
  title: autonomyCopy.title,
  hint: autonomyCopy.hint,
  highlight: HUD_NEEDS_HANDLE,
  // Both: the loop has run a few ticks AND `AGENT_TICKED` has been
  // observed by the session. The combined check guards against a
  // future tick driver that bumps `tickIndex` without publishing the
  // event (which would silently break this chapter's "did the agent
  // act?" promise).
  completionPredicate: combineAll(
    tickAtLeast(AUTONOMY_TICK_THRESHOLD),
    eventEmittedSince(AGENT_TICKED, 0),
  ),
  nextOnComplete: TOUR_END,
};

/** All steps authored for chapter 1, in declaration order. */
export const chapter1Steps: ReadonlyArray<WalkthroughStep> = [autonomyStep];
