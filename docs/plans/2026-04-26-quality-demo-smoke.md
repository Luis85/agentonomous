# Quality automation — Nightly Playwright demo smoke

> **Tracks:** [#130](https://github.com/Luis85/agentonomous/pull/130) (umbrella plan) · [#131](https://github.com/Luis85/agentonomous/issues/131) (durable issue tracker) · row 8 of
> [`2026-04-26-quality-automation-routines.md`](./2026-04-26-quality-automation-routines.md)
>
> **Branch (this row):** cut a fresh worktree off `origin/develop` —
> e.g. `test/demo-smoke` under `.worktrees/test-demo-smoke`.

**Goal:** Add a nightly + PR-path-filtered Playwright headless smoke
test that clicks the golden path through the demo and asserts the
HUD updates with no console errors.

**Rationale:** existing CI builds the demo (`demo-build` job) but
never runs it. A headless click-through across the golden path
catches runtime regressions that typecheck + bundle don't (tfjs
backend probe, `base` URL handling, vite HTML transform regressions
— see `MEMORY.md → feedback_vite_html_transform`).

## Coordination with PR #129 (demo rename) — RESOLVED

> Wave 0 of PR #129 merged as
> [#134](https://github.com/Luis85/agentonomous/pull/134) on
> 2026-04-26; the demo lives at `examples/product-demo/` on
> `develop`. Every path below is the post-rename name verbatim — no
> conditional sequencing remains. The umbrella's
> [Coordination section](./2026-04-26-quality-automation-routines.md#coordination-with-pr-129-demo-rename--resolved)
> is the historical reference.

## Files

- Create: `examples/product-demo/playwright.config.ts`
- Create: `examples/product-demo/tests/smoke/golden-path.spec.ts`
- Create: `.github/workflows/demo-smoke.yml`
- Modify: `examples/product-demo/package.json` — devDep + script
- Modify: `.gitignore`

## Steps

- [ ] **Step 1: Add Playwright to the demo**

```bash
cd examples/product-demo
npm install --save-dev --save-exact @playwright/test@latest
npx playwright install --with-deps chromium
cd -
```

Pin `@playwright/test` in `examples/product-demo/package.json`. Do
NOT add it to the root `package.json` — the demo manages its own
deps (`MEMORY.md` notes the `file:../..` EISDIR pitfall on Windows).

- [ ] **Step 2: `examples/product-demo/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: false,           // single demo instance, single worker
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

- [ ] **Step 3: Write `tests/smoke/golden-path.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('golden path: feed → pet → sleep updates HUD without console errors', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Replace selectors with the actual demo controls — discoverable
  // via `npm run dev` + DevTools. Keep this spec tied to user-
  // facing roles (button names, ARIA labels) not implementation
  // classes.
  await page.getByRole('button', { name: /feed/i }).click();
  await page.getByRole('button', { name: /pet/i }).click();
  await page.getByRole('button', { name: /sleep/i }).click();

  // HUD assertion — pick one stable observable (e.g. "Hunger" stat
  // text changes). Adapt during step 4.
  await expect(page.getByTestId('hud-needs')).toContainText(/Hunger/);

  expect(consoleErrors).toEqual([]);
});
```

- [ ] **Step 4: Run locally to wire selectors**

The `playwright.config.ts` from Step 2 already declares a `webServer`
block that spawns `npm run preview ...` and waits for port 4173
before Playwright sends any request. **Do NOT background `npm run
preview` yourself** — that races the playwright runner against
vite's startup (`npm run build && npm run preview &` returns as
soon as the shell forks the chain, not when the port is bound).
Just build the demo synchronously first, then hand control to
playwright:

```bash
cd examples/product-demo
npm run build
npx playwright test --headed --project=chromium
cd -
```

Playwright spawns the preview server itself, polls
`http://127.0.0.1:4173` until it responds, then runs the spec.
With `reuseExistingServer: !process.env.CI` (Step 2 config), it
also reuses an already-running `npm run preview` if you've left
one open in another terminal — but you do NOT need to start one
manually for this step.

Iterate on selectors until the spec passes. **If the demo lacks
stable testids on the HUD, add them in this same row** (not a
separate PR; the smoke depends on them).

- [ ] **Step 5: Add script to `examples/product-demo/package.json`**

```json
"smoke": "playwright test"
```

- [ ] **Step 6: Update `.gitignore`**

```
examples/product-demo/playwright-report/
examples/product-demo/test-results/
```

- [ ] **Step 7: Workflow**

Resolve action SHAs first via the umbrella's helper. Then:

```yaml
# .github/workflows/demo-smoke.yml
name: Demo smoke

on:
  schedule:
    - cron: '30 3 * * *'   # Daily 03:30 UTC
  pull_request:
    paths:
      - 'examples/product-demo/**'
      - 'src/**'           # library changes can break demo at runtime
      - '.github/workflows/demo-smoke.yml'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<sha> # v6.0.2
      - uses: actions/setup-node@<sha> # v6.4.0
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
      - name: Install demo deps
        working-directory: examples/product-demo
        run: npm ci --no-audit --no-fund
      - name: Install Playwright browsers
        working-directory: examples/product-demo
        run: npx playwright install --with-deps chromium
      - name: Build demo
        working-directory: examples/product-demo
        run: npm run build
      - name: Smoke (Playwright)
        working-directory: examples/product-demo
        run: npm run smoke
      - uses: actions/upload-artifact@<sha> # v5.0.0
        if: failure()
        with:
          name: playwright-report
          path: examples/product-demo/playwright-report/
          retention-days: 14
```

- [ ] **Step 8: actionlint + verify (root) + smoke run (demo)**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/demo-smoke.yml
npm run verify
( cd examples/product-demo && npm run smoke )
```

- [ ] **Step 9: Commit + push + open PR**

```bash
git add examples/product-demo/playwright.config.ts \
        examples/product-demo/tests/ \
        examples/product-demo/package.json \
        examples/product-demo/package-lock.json \
        .github/workflows/demo-smoke.yml \
        .gitignore
git commit -m "test(demo): nightly Playwright smoke on golden path"
git push -u origin test/demo-smoke
gh pr create --base develop \
  --title "test(demo): nightly Playwright smoke on golden path" \
  --body "Tracks: #130
Tracks: #131

Adds Playwright headless smoke against the built demo: feed → pet →
sleep, asserts HUD updates and zero console errors. Runs nightly at
03:30 UTC + on PRs that touch examples/product-demo/, src/, or this
workflow file. Failed runs upload the playwright-report artifact.

Ticks row 8 of the umbrella tracker."
```

- [ ] **Step 10: Tick tracker row 8 in the same PR (amend + force-with-lease)**

```diff
-| 8   | [quality-demo-smoke.md](./2026-04-26-quality-demo-smoke.md) | Nightly Playwright headless smoke against built demo | nightly + PR-path | no (demo/) | - [ ] not started |
+| 8   | [quality-demo-smoke.md](./2026-04-26-quality-demo-smoke.md) | Nightly Playwright headless smoke against built demo | nightly + PR-path | no (demo/) | - [x] shipped via #NNN |
```

## Acceptance criteria

- `npm run smoke` (from `examples/product-demo/`) passes locally.
- The CI smoke run on PR open is green.
- `.github/workflows/demo-smoke.yml` is actionlint-clean.
- Tracker row 8 is `[x]`.

## Rename-coordination — RESOLVED

Wave 0 of PR #129 merged as
[#134](https://github.com/Luis85/agentonomous/pull/134) on
2026-04-26. This row uses `examples/product-demo/` paths verbatim;
no follow-up rename PR is needed.
