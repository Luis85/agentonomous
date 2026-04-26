/**
 * Chapter 4 — JSON tuning (placeholder until Pillar-4 lands).
 *
 * Pillar-4 owns the proper preview / commit dual-action flow against
 * `useConfigDraft` + the editor view; until that ships, slice 1.3
 * provides a single placeholder button in `<HudPanel>` that records
 * `ConfigPreviewOpened` so the walkthrough can advance. The button is
 * labelled "Preview JSON" and explicitly framed as a stand-in. When
 * Pillar-4 slice 4.3 lands, this chapter's step content stays valid:
 * the real editor will emit the same `ConfigPreviewOpened` event, the
 * placeholder button is removed, and the predicate keeps working.
 */

import { eventEmittedSinceStep } from '../predicates.js';
import type { WalkthroughStep } from '../types.js';
import { STEP_ID_JSON_PREVIEW, STEP_ID_REPLAY_EXPORT, tourCopy } from '../../../copy/tour.js';
import { registeredHandle } from '../../../stores/view/selectorHandles.js';

const JSON_TOGGLE_HANDLE = registeredHandle('hud.json.toggle');

const previewCopy = tourCopy[STEP_ID_JSON_PREVIEW];
if (previewCopy === undefined) {
  throw new Error('Missing tour copy entry for chapter-4 step');
}

const jsonPreviewStep: WalkthroughStep = {
  id: STEP_ID_JSON_PREVIEW,
  chapter: 4,
  title: previewCopy.title,
  hint: previewCopy.hint,
  highlight: JSON_TOGGLE_HANDLE,
  completionPredicate: eventEmittedSinceStep('ConfigPreviewOpened'),
  nextOnComplete: STEP_ID_REPLAY_EXPORT,
};

export const chapter4Steps: ReadonlyArray<WalkthroughStep> = [jsonPreviewStep];
