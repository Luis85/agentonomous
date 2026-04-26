# Quality automation — Weekly bundle-size trend snapshot

> **Tracks:** [#130](https://github.com/Luis85/agentonomous/pull/130) (umbrella plan) · [#131](https://github.com/Luis85/agentonomous/issues/131) (durable issue tracker) · row 5 of
> [`2026-04-26-quality-automation-routines.md`](./2026-04-26-quality-automation-routines.md)
>
> **Branch (this row):** cut a fresh worktree off `origin/develop` —
> e.g. `ci/bundle-size-trend` under `.worktrees/ci-bundle-size-trend`.

**Goal:** Add a weekly snapshot of `npx size-limit --json` to a
committed `docs/metrics/bundle-trend.jsonl` (one JSON row per week).

**Rationale:** existing `size-limit-comment` job posts the per-PR
delta but gives no longitudinal view. A weekly snapshot to a
committed JSONL file in `docs/metrics/` lets us graph the trend
later (and inspect by diff today).

## Files

- Create: `scripts/append-size-snapshot.mjs`
- Create: `scripts/append-size-snapshot.test.mjs`
- Create: `.github/workflows/bundle-size-trend.yml`
- Create: `docs/metrics/bundle-trend.jsonl` (empty file at first commit)

## Steps

- [ ] **Step 1: Write the snapshot script test (TDD red)**

Create `scripts/append-size-snapshot.test.mjs` first, then the
implementation. The test feeds the script a fixture
`size-limit --json` output via stdin and asserts:

- Output JSONL has exactly one row.
- Row keys: `iso` (UTC ISO-8601 date), `sha` (from env), `entries`
  (array of `{name, size, gzip}` from input).
- Existing rows in the target file are preserved; the new row is
  appended.

```js
// scripts/append-size-snapshot.test.mjs
import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(target, fixture, sha) {
  return spawnSync(
    process.execPath,
    ['scripts/append-size-snapshot.mjs', '--target', target],
    { input: fixture, env: { ...process.env, GITHUB_SHA: sha } },
  );
}

test('appends one JSONL row from size-limit JSON on stdin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sizesnap-'));
  const target = join(dir, 'bundle-trend.jsonl');
  writeFileSync(target, ''); // empty
  const fixture = JSON.stringify([
    { name: 'core', size: 1234, gzip: 567 },
    { name: 'integrations/excalibur', size: 200, gzip: 100 },
  ]);
  const out = run(target, fixture, 'abcdef0');
  expect(out.status).toBe(0);
  const rows = readFileSync(target, 'utf8').trim().split('\n').filter(Boolean);
  expect(rows).toHaveLength(1);
  const row = JSON.parse(rows[0]);
  expect(row.sha).toBe('abcdef0');
  expect(row.entries).toHaveLength(2);
  expect(row.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test('dedupes a same-day same-sha re-run (workflow_dispatch retry)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sizesnap-'));
  const target = join(dir, 'bundle-trend.jsonl');
  writeFileSync(target, '');
  const fixture = JSON.stringify([{ name: 'core', size: 100, gzip: 50 }]);
  expect(run(target, fixture, 'cafef00').status).toBe(0);
  expect(run(target, fixture, 'cafef00').status).toBe(0); // same (sha, date)
  const rows = readFileSync(target, 'utf8').trim().split('\n').filter(Boolean);
  expect(rows).toHaveLength(1); // second invocation was a no-op
});

test('appends a new row when entries are unchanged but sha differs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sizesnap-'));
  const target = join(dir, 'bundle-trend.jsonl');
  writeFileSync(target, '');
  // Identical bundle payload week-over-week MUST still produce a
  // new row — the JSONL is a snapshot time series, not a changelog.
  const fixture = JSON.stringify([{ name: 'core', size: 100, gzip: 50 }]);
  expect(run(target, fixture, 'aaaaaaa').status).toBe(0);
  expect(run(target, fixture, 'bbbbbbb').status).toBe(0);
  const rows = readFileSync(target, 'utf8').trim().split('\n').filter(Boolean);
  expect(rows).toHaveLength(2);
});
```

- [ ] **Step 2: Run the test (red)**

```bash
npx vitest run scripts/append-size-snapshot.test.mjs
```

Expected: FAIL (`Cannot find module 'scripts/append-size-snapshot.mjs'`).

- [ ] **Step 3: Implement `scripts/append-size-snapshot.mjs`**

Argv: `--target <path>`. Reads stdin → JSON. Builds
`{iso, sha, entries}`. Appends one line. Reads `GITHUB_SHA` from env
verbatim — no truncation, no validation. The workflow feeds whatever
shape it wants (full 40-char SHA in production; the test fixture
uses 7-char to demonstrate passthrough).

> **Idempotency policy.** Dedupe ONLY when the last existing row has
> the SAME `(date-portion-of-iso, sha)` tuple as the new row — that
> is, treat a re-run of the same cron firing as a no-op. **Do NOT
> dedupe on identical `entries`**: weeks where bundle sizes are
> unchanged from the previous snapshot must still produce a row, or
> the JSONL becomes a change-log instead of a time series and breaks
> any weekly trend analysis.
>
> Concretely, in the implementation:
>
> ```js
> // pseudo
> const lastRow = readLastJsonlRow(target);
> const sameRunRetry =
>   lastRow &&
>   lastRow.sha === newRow.sha &&
>   isoDate(lastRow.iso) === isoDate(newRow.iso);
> if (sameRunRetry) return; // identical (sha, calendar-date) → skip
> appendRow(target, newRow);
> ```
>
> The dedupe goal is "don't double-write if `workflow_dispatch` re-
> runs the cron in the same UTC day on the same commit", not
> "compress unchanged trends".

- [ ] **Step 4: Re-run the test (green)**

```bash
npx vitest run scripts/append-size-snapshot.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Create the empty trend file**

`docs/metrics/` does not exist on `develop` yet, so `touch` alone
fails with `No such file or directory`. Create the directory first:

```bash
mkdir -p docs/metrics
touch docs/metrics/bundle-trend.jsonl
```

JSONL has no header by definition; downstream tools assume one JSON
value per line. Keep the file empty. Confirm staging (some Windows
git filters elide zero-byte adds in their UI):

```bash
git add docs/metrics/bundle-trend.jsonl
git status --short docs/metrics/
# expected: A  docs/metrics/bundle-trend.jsonl
```

- [ ] **Step 6: Write `.github/workflows/bundle-size-trend.yml`**

Resolve action SHAs first via the umbrella's
[`resolve_action_sha` helper](./2026-04-26-quality-automation-routines.md#resolve-an-action-tag--commit-sha-peel-aware-helper).
Then:

```yaml
name: Bundle-size trend

on:
  schedule:
    # Sundays 04:00 UTC. After the Monday CodeQL window so two cron
    # workflows don't collide on a single runner pool peak.
    - cron: '0 4 * * 0'
  workflow_dispatch:

permissions:
  contents: write   # commits the snapshot row

jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v6.0.2
        with: { ref: develop }
      - uses: actions/setup-node@<sha> # v6.4.0
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
      # Resolve the SHA from the checked-out tree, NOT from
      # `github.sha`. On `schedule` runs the event context's SHA
      # points at the default-branch tip (this repo's default is
      # `main` while the checkout above pins `ref: develop`), so the
      # two diverge and the JSONL row would record a SHA that does
      # not match the code `size-limit` actually measured.
      - name: Resolve checked-out SHA
        id: head
        run: echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
      - name: Append snapshot row
        env:
          GITHUB_SHA: ${{ steps.head.outputs.sha }}
        run: |
          npx size-limit --json | \
            node scripts/append-size-snapshot.mjs \
              --target docs/metrics/bundle-trend.jsonl
      - name: Commit + push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if [[ -n "$(git status --porcelain docs/metrics/bundle-trend.jsonl)" ]]; then
            git add docs/metrics/bundle-trend.jsonl
            git commit -m "chore(metrics): bundle-size snapshot $(date -u +%F)"
            git push origin develop
          fi
```

> **Direct push to `develop`?** The repo rule says "never push direct
> to develop" but allows post-merge pulls. This is a metrics append
> by github-actions bot, not human work. If branch protection on
> `develop` blocks even bot pushes, switch to: open a PR per run via
> `peter-evans/create-pull-request@<sha>` and let the dep-triage
> routine auto-merge it. Decide at Step 7.

- [ ] **Step 7: Decide direct-push vs PR-bot path**

```bash
gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/develop/protection" 2>&1 | head -20
```

If `required_status_checks` includes `ci-gate` and direct push is
blocked → switch the workflow to open a PR via
`peter-evans/create-pull-request@<sha>` and document the path swap
in the PR body. Otherwise leave the direct-push path.

- [ ] **Step 8: actionlint + verify**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/bundle-size-trend.yml
npm run verify
```

- [ ] **Step 9: Commit + push + open PR**

```bash
git add scripts/append-size-snapshot.mjs scripts/append-size-snapshot.test.mjs \
        docs/metrics/bundle-trend.jsonl .github/workflows/bundle-size-trend.yml
git commit -m "ci(metrics): weekly bundle-size trend snapshot"
git push -u origin ci/bundle-size-trend
gh pr create --base develop \
  --title "ci(metrics): weekly bundle-size trend snapshot" \
  --body "Tracks: #130
Tracks: #131

Adds a Sundays-04:00-UTC weekly workflow that snapshots npx size-limit
--json for the develop tip into docs/metrics/bundle-trend.jsonl. SHA
is resolved from the checked-out tree (git rev-parse HEAD), NOT
github.sha (which would point at the default-branch tip on schedule
events).

Ticks row 5 of the umbrella tracker."
```

- [ ] **Step 10: Tick tracker row 5 in the same PR (amend + force-with-lease)**

```diff
-| 5   | [quality-bundle-trend.md](./2026-04-26-quality-bundle-trend.md) | Weekly snapshot of `npx size-limit --json` to a committed JSONL trend file | weekly | no | - [ ] not started |
+| 5   | [quality-bundle-trend.md](./2026-04-26-quality-bundle-trend.md) | Weekly snapshot of `npx size-limit --json` to a committed JSONL trend file | weekly | no | - [x] shipped via #NNN |
```

## Acceptance criteria

- `scripts/append-size-snapshot.mjs` test passes locally and in CI,
  including the dedupe-policy assertions: same `(sha, calendar-date)`
  re-run is a no-op; identical-payload week-over-week with a new sha
  appends a new row.
- `docs/metrics/bundle-trend.jsonl` exists (empty) on `develop`.
- `.github/workflows/bundle-size-trend.yml` is actionlint-clean.
- First scheduled run on the next Sunday produces a single JSONL row
  on `develop` with a correct sha matching the develop tip.
- Tracker row 5 is `[x]`.
