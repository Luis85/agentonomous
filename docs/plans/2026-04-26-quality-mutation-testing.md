# Quality automation — Weekly StrykerJS mutation run

> **Tracks:** [#130](https://github.com/Luis85/agentonomous/pull/130) (umbrella plan) · [#131](https://github.com/Luis85/agentonomous/issues/131) (durable issue tracker) · row 7 of
> [`2026-04-26-quality-automation-routines.md`](./2026-04-26-quality-automation-routines.md)
>
> **Branch (this row):** cut a fresh worktree off `origin/develop` —
> e.g. `test/mutation-testing` under `.worktrees/test-mutation-testing`.

**Goal:** Add a weekly StrykerJS mutation run on `develop` that
emits an HTML report artifact and breaks the workflow on score
regression below the committed threshold.

**Rationale:** existing coverage delta proves *lines ran*. Mutation
testing proves *tests would fail if the line changed*. Pairs with
the existing coverage PR comment to close the "test asserts nothing"
loophole.

## Files

- Create: `stryker.config.mjs`
- Create: `.github/workflows/mutation.yml`
- Modify: `package.json` (devDeps + scripts)
- Modify: `.gitignore`

## Steps

- [ ] **Step 1: Add devDeps**

```bash
npm install --save-dev --save-exact \
  @stryker-mutator/core@latest \
  @stryker-mutator/vitest-runner@latest
```

Pin exact versions in `package.json`. Update lockfile.

- [ ] **Step 2: Write `stryker.config.mjs`**

```js
// stryker.config.mjs
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  reporters: ['progress', 'clear-text', 'html', 'dashboard'],
  coverageAnalysis: 'perTest',
  // Mutate library source only. Skip integrations + tooling.
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/index.ts',
    '!src/integrations/**',
    '!src/**/internal/**', // already covered transitively via callers
  ],
  thresholds: { high: 80, low: 60, break: 55 },
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  timeoutMS: 15_000,
  concurrency: 4,
};
```

> Threshold seed values are placeholders — the first run produces
> the baseline. After that run lands, replace `break: 55` with
> `floor(score) - 2` so future regressions fail the job but normal
> noise does not. Capture the baseline number in the row's commit
> message.

- [ ] **Step 3: Add scripts to `package.json`**

```json
"mutation": "stryker run"
```

> **Why no `mutation:report` convenience script?** Earlier drafts of
> this plan included `"mutation:report": "open reports/mutation/mutation.html"`,
> but `open` is macOS-only — it fails with `command not found` on
> Linux (which uses `xdg-open`) and Windows (which uses `start`).
> Adding a cross-platform launcher (`open-cli`, `node:child_process`
> branch by `process.platform`, etc.) buys ~3 keystrokes for one
> extra devDep or one extra script file. Not worth it. Document the
> path in the per-OS commands below instead and let contributors
> open the file with their platform's native tools:
>
> ```bash
> # macOS
> open reports/mutation/mutation.html
> # Linux
> xdg-open reports/mutation/mutation.html
> # Windows (Git Bash / WSL)
> start reports/mutation/mutation.html
> ```
>
> The HTML report is the deliverable; how a reader opens it is not a
> repo concern. CI uploads the same file as the `mutation-report`
> artifact (Step 6), so reviewers consume it from the GitHub UI
> anyway.

- [ ] **Step 4: Update `.gitignore`**

```
reports/mutation/
.stryker-tmp/
```

- [ ] **Step 5: Run locally to capture the baseline score**

```bash
npm run mutation
```

Expected: prints a score (e.g. "Mutation score: 73.4%"). This is
the baseline. **Update `stryker.config.mjs` `thresholds.break`** to
`floor(score) - 2` and re-run to confirm green.

> Local run on full suite is slow (~15-30 min). If it exceeds 45
> min, trim `mutate` further (e.g. exclude `src/persistence/` for
> the first pass) and document the carve-out in the row's commit
> message.

- [ ] **Step 6: Workflow**

Resolve action SHAs first via the umbrella's helper. Then:

```yaml
# .github/workflows/mutation.yml
name: Mutation testing

on:
  schedule:
    - cron: '0 7 * * 1'  # Mondays 07:00 UTC, after CodeQL + determinism
  workflow_dispatch:

permissions:
  contents: read

jobs:
  stryker:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@<sha> # v6.0.2
      - uses: actions/setup-node@<sha> # v6.4.0
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run mutation
      - uses: actions/upload-artifact@<sha> # v5.0.0
        if: always()
        with:
          name: mutation-report
          path: reports/mutation/
          if-no-files-found: error
          retention-days: 30
```

- [ ] **Step 7: actionlint + verify**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/mutation.yml
npm run verify
```

> `npm run verify` does NOT include `npm run mutation` — too slow
> for the pre-PR gate. Mutation runs only on the weekly schedule.

- [ ] **Step 8: Commit + push + open PR**

```bash
git add stryker.config.mjs .github/workflows/mutation.yml \
        package.json package-lock.json .gitignore
git commit -m "test(mutation): weekly Stryker run on develop (baseline N%)"
git push -u origin test/mutation-testing
gh pr create --base develop \
  --title "test(mutation): weekly Stryker run on develop (baseline N%)" \
  --body "Tracks: #130
Tracks: #131

Adds a Mondays-07:00-UTC weekly StrykerJS mutation run. Mutates
src/ only (skips integrations/internal). Uploads HTML report as a
30-day artifact. Threshold pinned at floor(baseline) - 2 captured
in the commit message.

Ticks row 7 of the umbrella tracker."
```

- [ ] **Step 9: Tick tracker row 7 in the same PR (amend + force-with-lease)**

```diff
-| 7   | [quality-mutation-testing.md](./2026-04-26-quality-mutation-testing.md) | Weekly StrykerJS mutation run with HTML report artifact | weekly | no | - [ ] not started |
+| 7   | [quality-mutation-testing.md](./2026-04-26-quality-mutation-testing.md) | Weekly StrykerJS mutation run with HTML report artifact | weekly | no | - [x] shipped via #NNN |
```

## Acceptance criteria

- `npm run mutation` runs locally and prints a score.
- `stryker.config.mjs` `thresholds.break` is set to
  `floor(baseline) - 2` based on the local run, with the baseline
  number captured in the commit message.
- `.github/workflows/mutation.yml` is actionlint-clean.
- Tracker row 7 is `[x]`.
