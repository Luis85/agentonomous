import { defineConfig, devices } from '@playwright/test';

/**
 * Placeholder Playwright config for the pre-v1 demo evolution increment.
 *
 * Wave-0 (rename preflight) wires `npm run e2e` so every downstream pillar
 * PR can rely on the entry point existing. Named scripts
 * (`tour-happy-path.spec.ts`, `replay-determinism.spec.ts`,
 * `scenario-swap.spec.ts`) are added by their owning pillar PRs — see
 * `docs/specs/2026-04-26-pre-v1-demo-evolution-design.md` (testing
 * strategy → end-to-end).
 *
 * The `tests/e2e/` directory ships empty in this PR; Playwright treats
 * "no specs" as a successful run, so `npm run e2e` exits 0.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
