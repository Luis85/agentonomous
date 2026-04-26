import { test, expect } from '@playwright/test';

/**
 * Placeholder Playwright spec.
 *
 * Wave-0 (rename preflight) wires `npm run e2e` so every downstream
 * pillar PR can rely on the entry point existing. Playwright fails the
 * run if no tests are found, so this no-op spec keeps the command exit
 * 0 until the named pillar specs land:
 *
 * - `tour-happy-path.spec.ts`        — pillar 1 (guided walkthrough)
 * - `replay-determinism.spec.ts`     — pillar 3 (determinism fingerprint)
 * - `scenario-swap.spec.ts`          — pillar 5 (second scenario)
 *
 * Delete this file when the first real spec ships.
 */
test('e2e harness placeholder', () => {
  expect(true).toBe(true);
});
