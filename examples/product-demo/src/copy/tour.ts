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

/** Chapter-2 — Trace visibility. */
export const STEP_ID_TRACE_OPEN = walkthroughStepId('chapter-2.trace-open');
export const STEP_ID_TRACE_OBSERVE = walkthroughStepId('chapter-2.trace-observe');

/** Chapter-3 — Cognition switching. */
export const STEP_ID_COGNITION_SWAP = walkthroughStepId('chapter-3.cognition-swap');
export const STEP_ID_COGNITION_OBSERVE = walkthroughStepId('chapter-3.cognition-observe');

/** Chapter-4 — JSON tuning (placeholder until Pillar-4 lands). */
export const STEP_ID_JSON_PREVIEW = walkthroughStepId('chapter-4.json-preview');

/** Chapter-5 — Deterministic replay. */
export const STEP_ID_REPLAY_EXPORT = walkthroughStepId('chapter-5.replay-export');
export const STEP_ID_REPLAY_IMPORT = walkthroughStepId('chapter-5.replay-import');

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
  [STEP_ID_TRACE_OPEN]: {
    title: 'Open the decision trace',
    hint: 'Click "Show decision trace" to peek at why Whiskers picked its action. The panel lists candidates, scores, and what won this tick.',
  },
  [STEP_ID_TRACE_OBSERVE]: {
    title: 'Read along for a tick or two',
    hint: 'Give it a couple of ticks — every tick refreshes the trace with the next decision. Notice which candidate jumps to the top as needs change.',
  },
  [STEP_ID_COGNITION_SWAP]: {
    title: 'Switch how Whiskers thinks',
    hint: 'Use the cognition picker in the HUD to switch off the default heuristic. Each mode reaches its decision differently.',
  },
  [STEP_ID_COGNITION_OBSERVE]: {
    title: 'Watch the new mode in action',
    hint: 'Hang on for one more tick — the trace panel will refresh and the chosen action might come from a different reason than before.',
  },
  [STEP_ID_JSON_PREVIEW]: {
    title: 'Tune the species config',
    hint: 'Tap the "Preview JSON" button to peek at what tweaking Whiskers\' parameters would do. The full editor lands soon — for now the button just confirms you\'ve seen it.',
  },
  [STEP_ID_REPLAY_EXPORT]: {
    title: 'Save this run',
    hint: 'Click "💾 Export" to download a JSON snapshot of the current pet. It captures the seed, ticks, needs — everything needed to replay.',
  },
  [STEP_ID_REPLAY_IMPORT]: {
    title: 'Load it back',
    hint: 'Now click "📂 Import" and pick the file you just saved. The agent rewinds to that exact frame; same seed, same outcomes.',
  },
};
