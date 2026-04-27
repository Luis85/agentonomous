import { expect, test } from '@playwright/test';

/**
 * Pillar-1 slice 1.4 — end-to-end gate for the guided walkthrough.
 *
 * Drives the full chapter 1 → 5 flow against the production build:
 * intro CTA → autonomy auto-advance → trace-panel toggle → cognition-mode
 * swap → JSON-preview placeholder → snapshot export → snapshot import.
 * Asserts the URL tracks `/tour/<step-id>` per spec P1-FR-6 and that the
 * overlay disappears once `useTourProgress.completedAt` is set, which is
 * the spec's "end-of-tour screen" (P1-AC-1) — the live shell at `/tour`
 * does not gate-render the simulation, so completion just means the
 * overlay card stops rendering.
 *
 * Spec coverage: P1-AC-1 (≤ 25 user actions, no dead-end UI) +
 * P1-AC-5 (this spec passes on every CI run). The other AC entries
 * (resume, reset hygiene, skip recording) are covered by the
 * unit-level vitest specs against `useTourProgress`.
 *
 * The test runs against a fresh browser profile (`storageState` is not
 * preserved between Playwright runs by default) and explicitly clears
 * the demo's `demo.v2.*` storage keys before navigating so a leftover
 * persisted-progress payload from a prior debug run cannot pre-satisfy
 * the cursor.
 */

const STEP_ID = {
  autonomy: 'chapter-1.autonomy',
  traceOpen: 'chapter-2.trace-open',
  traceObserve: 'chapter-2.trace-observe',
  cognitionSwap: 'chapter-3.cognition-swap',
  cognitionObserve: 'chapter-3.cognition-observe',
  jsonPreview: 'chapter-4.json-preview',
  replayExport: 'chapter-5.replay-export',
  replayImport: 'chapter-5.replay-import',
} as const;

/**
 * Wait for the tour cursor to land on `stepId`. We only assert URLs for
 * steps that gate on a user action — chapters that auto-advance through
 * an "observe" step (chapter 2 + chapter 3) chain back-to-back inside a
 * single Vue task, so the intermediate `/tour/<observe-step>` URL may
 * never settle long enough for `waitForURL` to catch.
 */
async function expectTourStep(
  page: import('@playwright/test').Page,
  stepId: string,
): Promise<void> {
  await page.waitForURL(`**/tour/${stepId}`, { timeout: 15_000 });
  await expect(page.locator('.tour-overlay__title')).toBeVisible();
}

test.describe('Pillar-1 guided walkthrough — happy path', () => {
  test.beforeEach(async ({ page }) => {
    // Clean profile: clear the demo's v2 storage keys before the page
    // boots so any persisted progress from a prior local run cannot
    // pre-satisfy chapter predicates. We have to navigate first to
    // bind a same-origin context for `localStorage` access.
    await page.goto('/');
    await page.evaluate(() => {
      const keys: string[] = [];
      for (let i = 0; i < globalThis.localStorage.length; i += 1) {
        const k = globalThis.localStorage.key(i);
        if (k !== null && k.startsWith('demo.v2.')) keys.push(k);
      }
      for (const k of keys) globalThis.localStorage.removeItem(k);
    });
    await page.reload();
  });

  test('reaches end-of-tour through chapters 1-5', async ({ page }) => {
    // Action 1 — Start guided tour. Chapter-1 auto-advances after ≥ 3
    // ticks + an `AgentTicked` since baseline; with `BASE_TIME_SCALE`
    // = 10 + ~60Hz rAF this is sub-second.
    await page.locator('.intro-view__primary').click();
    await expectTourStep(page, STEP_ID.autonomy);
    await expectTourStep(page, STEP_ID.traceOpen);

    // Action 2 — open the trace panel. Chapter-2 trace-open uses
    // `flagOpen('TracePanelOpened', 'TracePanelClosed')` so the
    // visible→true toggle satisfies the predicate; the trace-observe
    // step then auto-advances on the next fresh tick. The two
    // transitions can fire inside a single Vue task, so we wait
    // directly on chapter-3's user-action gate.
    await page.locator('.trace-panel__toggle').click();
    await expectTourStep(page, STEP_ID.cognitionSwap);

    // Action 3 — swap cognition to a non-heuristic mode. `bt`
    // (mistreevous) ships as a demo devDependency so the peer
    // probe resolves; the async `setCognitionMode` awaits probe +
    // construct + `setReasoner` before flipping `cognitionModeId`.
    // Chapter-3 observe auto-advances on the next tick; same
    // back-to-back pattern as chapter 2 — wait on chapter-4.
    await page.locator('.cognition__select').selectOption('bt');
    await expectTourStep(page, STEP_ID.jsonPreview);

    // Action 4 — JSON-preview placeholder click (Pillar-4 will swap
    // this for the real editor without changing the chapter predicate).
    await page.locator('.json-preview__button').click();
    await expectTourStep(page, STEP_ID.replayExport);

    // Action 5 — export. The button triggers a JSON download via an
    // anchor click; capture the file so we can re-feed it on import.
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-tour-handle="export.button"]').click();
    const download = await downloadPromise;
    const exportPath = await download.path();
    expect(exportPath).not.toBeNull();
    await expectTourStep(page, STEP_ID.replayImport);

    // Action 6 — import. `setInputFiles` simulates the user picking
    // the file from the dialog (the visible "📂 Import" button only
    // proxies a click to this hidden input, so driving the input
    // directly is the standard Playwright shortcut).
    await page.locator('input[type="file"]').setInputFiles(exportPath as string);

    // End of tour: `completedAt` is set, `<TourOverlay>` stops
    // rendering, and the URL stays at the last cursor's step. The
    // overlay's title element is gated on `step !== null`, so the
    // disappearance assertion is the spec's "end-of-tour screen"
    // signal (P1-AC-1).
    await expect(page.locator('.tour-overlay__title')).toBeHidden({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`/tour/${STEP_ID.replayImport}$`));
  });
});
