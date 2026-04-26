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

## Coordination with PR #129 (demo rename)

> **Demo path:** every `examples/nurture-pet/...` reference below
> uses the pre-rename name. If Wave 0 of PR
> [#129](https://github.com/Luis85/agentonomous/pull/129) has merged
> into `develop` before this row starts, swap to
> `examples/product-demo/...` everywhere (file paths, `cd` targets,
> `working-directory` keys, `.gitignore` entries, `git add` lines).
> See [Coordination with PR #129](./2026-04-26-quality-automation-routines.md#coordination-with-pr-129-demo-rename)
> in the umbrella plan for the full decision rule.

## Files

- Create: `examples/nurture-pet/playwright.config.ts`
- Create: `examples/nurture-pet/tests/smoke/golden-path.spec.ts`
- Create: `.github/workflows/demo-smoke.yml`
- Modify: `examples/nurture-pet/package.json` — devDep + script
- Modify: `.gitignore`

## Steps

- [ ] **Step 0: Decide demo path before doing anything else**

```bash
git fetch origin
git ls-tree --name-only origin/develop examples/ | sort
```

If the listing contains `product-demo` (and not `nurture-pet`),
Wave 0 has landed — substitute the path everywhere in this row
before running any subsequent step. If the listing still contains
`nurture-pet`, proceed verbatim and ping the Wave 0 PR when it opens.

- [ ] **Step 1: Add Playwright to the demo**

```bash
cd examples/nurture-pet
npm install --save-dev --save-exact @playwright/test@latest
npx playwright install --with-deps chromium
cd -
```

Pin `@playwright/test` in `examples/nurture-pet/package.json`. Do
NOT add it to the root `package.json` — the demo manages its own
deps (`MEMORY.md` notes the `file:../..` EISDIR pitfall on Windows).

- [ ] **Step 2: `examples/nurture-pet/playwright.config.ts`**

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

```bash
cd examples/nurture-pet
npm run build && npm run preview &
PREVIEW_PID=$!
npx playwright test --headed --project=chromium
kill $PREVIEW_PID
cd -
```

Iterate on selectors until the spec passes. **If the demo lacks
stable testids on the HUD, add them in this same row** (not a
separate PR; the smoke depends on them).

- [ ] **Step 5: Add script to `examples/nurture-pet/package.json`**

```json
"smoke": "playwright test"
```

- [ ] **Step 6: Update `.gitignore`**

```
examples/nurture-pet/playwright-report/
examples/nurture-pet/test-results/
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
      - 'examples/nurture-pet/**'
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
        working-directory: examples/nurture-pet
        run: npm ci --no-audit --no-fund
      - name: Install Playwright browsers
        working-directory: examples/nurture-pet
        run: npx playwright install --with-deps chromium
      - name: Build demo
        working-directory: examples/nurture-pet
        run: npm run build
      - name: Smoke (Playwright)
        working-directory: examples/nurture-pet
        run: npm run smoke
      - uses: actions/upload-artifact@<sha> # v5.0.0
        if: failure()
        with:
          name: playwright-report
          path: examples/nurture-pet/playwright-report/
          retention-days: 14
```

- [ ] **Step 8: actionlint + verify (root) + smoke run (demo)**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/demo-smoke.yml
npm run verify
( cd examples/nurture-pet && npm run smoke )
```

- [ ] **Step 9: Commit + push + open PR**

```bash
git add examples/nurture-pet/playwright.config.ts \
        examples/nurture-pet/tests/ \
        examples/nurture-pet/package.json \
        examples/nurture-pet/package-lock.json \
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
03:30 UTC + on PRs that touch examples/nurture-pet/, src/, or this
workflow file. Failed runs upload the playwright-report artifact.

Ticks row 8 of the umbrella tracker."
```

- [ ] **Step 10: Tick tracker row 8 in the same PR (amend + force-with-lease)**

```diff
-| 8   | [quality-demo-smoke.md](./2026-04-26-quality-demo-smoke.md) | Nightly Playwright headless smoke against built demo | nightly + PR-path | no (demo/) | - [ ] not started |
+| 8   | [quality-demo-smoke.md](./2026-04-26-quality-demo-smoke.md) | Nightly Playwright headless smoke against built demo | nightly + PR-path | no (demo/) | - [x] shipped via #NNN |
```

## Acceptance criteria

- `npm run smoke` (from `examples/nurture-pet/`) passes locally.
- The CI smoke run on PR open is green.
- `.github/workflows/demo-smoke.yml` is actionlint-clean.
- Tracker row 8 is `[x]`.

## Rename-coordination follow-up

If Wave 0 of PR #129 has NOT yet merged when this PR opens:

1. Add a comment on the Wave 0 PR (whichever PR is the live rename
   PR at that time) listing the new `examples/nurture-pet/` paths
   this PR introduces, so the rename PR's sweep covers them.
2. After Wave 0 merges, do not open a follow-up PR to rename — the
   Wave 0 PR is responsible.

If Wave 0 has already merged before this PR opens, this PR uses
`examples/product-demo/` from the start and there is no follow-up.
