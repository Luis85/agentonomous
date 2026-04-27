import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the pre-v1 demo evolution increment.
 *
 * Slice 1.4 introduces the first real e2e — `tour-happy-path.spec.ts`
 * — and wires the `webServer` block so `npm run e2e` can run end-to-end
 * locally and in CI without manual server orchestration. The
 * production build is the gold path: Vite preview serves `dist/`,
 * mirroring the artifact users will hit on GitHub Pages. Building
 * the library + demo before invoking Playwright happens via the
 * root `npm run e2e` script (`npm run demo:build && playwright test`).
 *
 * `reuseExistingServer` keeps `npm run e2e` cheap during local
 * iteration — Vite stays running between repeated runs. CI always
 * starts a fresh server (`!process.env.CI`).
 *
 * Named scripts (`replay-determinism.spec.ts`, `scenario-swap.spec.ts`)
 * land alongside their owning pillar PRs.
 */
const PORT = Number(process.env.E2E_PORT ?? 5173);
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run preview:e2e -- --port ${String(PORT)}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
