/**
 * Chapter 5 — Deterministic replay. The user exports the current run,
 * imports it back, and observes the agent resume from the same frame.
 *
 * Two-step shape:
 *
 *   1. **replay-export** — wait for `<ExportImportPanel>` to publish
 *      the `SnapshotExported` UI event since this step started.
 *   2. **replay-import** — wait for `<ExportImportPanel>` to publish
 *      `SnapshotImported`. The import path runs `replayFromSnapshot`,
 *      which rebuilds the agent and resets `tickIndex`/`recentEvents`
 *      to zero — so we don't gate this step on a subsequent
 *      `AgentTicked` (the rebuild already proves the snapshot took).
 */

import { eventEmittedSinceStep } from '../predicates.js';
import { TOUR_END } from '../types.js';
import type { WalkthroughStep } from '../types.js';
import { STEP_ID_REPLAY_EXPORT, STEP_ID_REPLAY_IMPORT, tourCopy } from '../../../copy/tour.js';
import { registeredHandle } from '../../../stores/view/selectorHandles.js';

const EXPORT_HANDLE = registeredHandle('export.button');
const IMPORT_HANDLE = registeredHandle('import.button');

const exportCopy = tourCopy[STEP_ID_REPLAY_EXPORT];
const importCopy = tourCopy[STEP_ID_REPLAY_IMPORT];
if (exportCopy === undefined || importCopy === undefined) {
  throw new Error('Missing tour copy entry for chapter-5 steps');
}

const exportStep: WalkthroughStep = {
  id: STEP_ID_REPLAY_EXPORT,
  chapter: 5,
  title: exportCopy.title,
  hint: exportCopy.hint,
  highlight: EXPORT_HANDLE,
  completionPredicate: eventEmittedSinceStep('SnapshotExported'),
  nextOnComplete: STEP_ID_REPLAY_IMPORT,
};

const importStep: WalkthroughStep = {
  id: STEP_ID_REPLAY_IMPORT,
  chapter: 5,
  title: importCopy.title,
  hint: importCopy.hint,
  highlight: IMPORT_HANDLE,
  completionPredicate: eventEmittedSinceStep('SnapshotImported'),
  nextOnComplete: TOUR_END,
};

export const chapter5Steps: ReadonlyArray<WalkthroughStep> = [exportStep, importStep];
