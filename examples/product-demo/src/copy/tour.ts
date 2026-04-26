/**
 * Tour copy bundle (Pillar 1, slice 1.2b).
 *
 * Tone: **friendly-informal**, second-person, light verbs. Picked over
 * terse-instructional and presenter-narration after the OQ-P1 review;
 * the rationale is recorded in the slice plan's Done log. The chapter-1
 * vertical lands here; chapters 2-5 fan out in slice 1.3 against the
 * same shape.
 *
 * Each entry is a `(stepId → { title, hint })` mapping. The `hint` is
 * the body text rendered inside the `<TourOverlay>` for the active
 * step; the `title` doubles as the heading and as the chapter index.
 *
 * Pure data — no Vue imports, no DOM. Components import the bundle
 * directly via `tourCopy[stepId]`.
 */

import type { WalkthroughStepId } from '../demo-domain/walkthrough/types.js';
import { walkthroughStepId } from '../demo-domain/walkthrough/types.js';

/** Copy entry shape consumed by `<TourOverlay>` and chapter step factories. */
export type TourCopyEntry = {
  readonly title: string;
  readonly hint: string;
};

/** Step id used by chapter-1's autonomy step. */
export const STEP_ID_AUTONOMY = walkthroughStepId('chapter-1.autonomy');

/**
 * Authored copy for every shipped step. Adding a chapter means adding
 * an entry here AND a step factory under `demo-domain/walkthrough/chapters/`.
 * The mapping is intentionally exhaustive so a missing copy entry surfaces
 * as a `tsc` error in the rendering component, not a silent empty hint.
 */
export const tourCopy: Readonly<Record<WalkthroughStepId, TourCopyEntry>> = {
  [STEP_ID_AUTONOMY]: {
    title: 'Whiskers does its own thing',
    hint: "Sit back for a sec — Whiskers will start acting on its own. Watch the bars on the right; the most urgent need is the one it'll go after first.",
  },
};
