# Quality automation — Determinism replay (hash-pinned, 8 seeds)

> **Tracks:** [#130](https://github.com/Luis85/agentonomous/pull/130)
> (umbrella) · row 6 of
> [`2026-04-26-quality-automation-routines.md`](./2026-04-26-quality-automation-routines.md)
>
> **Branch (this row):** cut a fresh worktree off `origin/develop` —
> e.g. `test/determinism-replay` under `.worktrees/test-determinism-replay`.

**Goal:** Add an end-to-end determinism check: run a seeded pet
simulation across 8 seeds, hash the resulting `DecisionTrace` event
stream, and assert each digest matches a committed
`baseline.json`.

**Rationale:** the determinism rule (`SeededRng` + `ManualClock` ⇒
byte-identical `DecisionTrace`) is enforced statically by ESLint
(no `Date.now`/`Math.random`) but never tested **end-to-end**. A
hash-pinned replay catches non-static violations: a new helper that
secretly reads `performance.now()`, a `Date` constructor inside a
needs policy, an unstable `Set` iteration order, etc.

## Files

- Create: `tests/determinism/replay.ts` (pure replay function)
- Create: `tests/determinism/replay.test.ts` (dual-mode: assert OR
  write-baseline depending on argv)
- Create: `tests/determinism/baseline.json` (committed ground truth)
- Create: `.github/workflows/determinism.yml`
- Modify: `package.json` — scripts `determinism:replay`,
  `determinism:baseline`.

> **No `tsx` runtime, no extra script.** Earlier drafts shelled out
> via `node --import tsx scripts/run-determinism-replay.mjs` to seed
> `baseline.json`. That required adding `tsx` as a devDep and a
> separate harness file. Both are dropped — the same vitest test file
> handles assertion AND baseline-write modes, switched by an argv
> flag passed through `npx vitest -- --write-baseline`. Vitest already
> transpiles TS; no extra runtime needed.

## Steps

- [ ] **Step 1: Decide the seed set**

Pick 8 seed strings. Mix short, long, ASCII, and non-ASCII to also
catch encoding regressions. Hard-code in `replay.ts`:

```ts
export const REPLAY_SEEDS = [
  'alpha', 'beta', 'gamma',
  '12345678901234567890',
  'snowman-☃️',
  'mixed-CASE-42',
  'r-eat-then-sleep',
  'mood-swing-edge',
];
```

- [ ] **Step 2: Write `tests/determinism/replay.ts`**

Pure function `replaySeed(seed: string): string` (sha256 hex). Inside:

1. Construct `SeededRng(seed)` + `ManualClock(0)`.
2. Build a default agent via the public test helpers (mirror the
   pattern in `tests/integration/`).
3. Tick 1000 times advancing the clock by 100 ms per tick.
4. Stream every event from the bus into a hash; return the digest.

Use `crypto.createHash('sha256')` from `node:crypto`.

- [ ] **Step 3: Write the dual-mode test file (red)**

The same file serves two modes:

- **Assertion mode** (default): each seed digest must equal the
  committed baseline.
- **Write mode** (when `--write-baseline` is passed via vitest argv):
  recompute every digest and overwrite `baseline.json`. No
  assertions — the goal is to capture a new ground truth after a
  deliberate library change.

```ts
// tests/determinism/replay.test.ts
import { test, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { REPLAY_SEEDS, replaySeed } from './replay.js';

const baselinePath = new URL('./baseline.json', import.meta.url);
const writeMode = process.argv.includes('--write-baseline');

if (writeMode) {
  test('write baseline.json from current replay digests', () => {
    const map: Record<string, string> = {};
    for (const seed of REPLAY_SEEDS) map[seed] = replaySeed(seed);
    writeFileSync(baselinePath, `${JSON.stringify(map, null, 2)}\n`);
  });
} else {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Record<
    string,
    string
  >;
  test.each(REPLAY_SEEDS)('replay matches baseline: %s', (seed) => {
    expect(replaySeed(seed)).toBe(baseline[seed]);
  });
}
```

> **Why argv, not an env var?** `npm run` on Windows uses `cmd.exe`
> by default, which does not respect a `WRITE_BASELINE=1 prefix`
> idiom. Vitest passes everything after `--` through to
> `process.argv`, so an argv flag is portable without bringing in
> `cross-env`.

- [ ] **Step 4: Run assertion mode (red)**

```bash
npx vitest run tests/determinism/replay.test.ts
```

Expected: FAIL — `baseline.json` does not exist yet, so the
`readFileSync` call throws `ENOENT` before any test runs.

- [ ] **Step 5: Generate `baseline.json` once via write mode**

```bash
npx vitest run tests/determinism/replay.test.ts -- --write-baseline
```

Inspect the result:

```bash
cat tests/determinism/baseline.json
```

Expected: an 8-key JSON object, each value a 64-char hex digest.

- [ ] **Step 6: Re-run assertion mode (green)**

```bash
npx vitest run tests/determinism/replay.test.ts
```

Expected: PASS for all 8 seeds.

- [ ] **Step 7: Run three times to confirm stability**

```bash
for i in 1 2 3; do npx vitest run tests/determinism/replay.test.ts; done
```

Expected: PASS PASS PASS. Any flake means the harness is
non-deterministic — fix `replay.ts` rather than weakening the
assertion.

- [ ] **Step 8: Wire scripts in `package.json`**

```json
"determinism:replay": "vitest run tests/determinism/replay.test.ts",
"determinism:baseline": "vitest run tests/determinism/replay.test.ts -- --write-baseline"
```

Both scripts are pure `vitest run` invocations — no `tsx`, no
`cross-env`, no separate harness. The argv flag is the only mode
switch.

- [ ] **Step 9: Workflow**

Resolve action SHAs first via the umbrella's helper. Then:

```yaml
# .github/workflows/determinism.yml
name: Determinism replay

on:
  schedule:
    - cron: '0 5 * * 1'  # Mondays 05:00 UTC, before CodeQL
  push:
    branches: [develop]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  replay:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v6.0.2
      - uses: actions/setup-node@<sha> # v6.4.0
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run determinism:replay
```

> **Why also on `push: develop`?** Catching a determinism violation
> *between* the weekly run is worth one ~1-minute job per merge.

- [ ] **Step 10: actionlint + verify**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/determinism.yml
npm run verify
```

- [ ] **Step 11: Commit + push + open PR**

```bash
git add tests/determinism/ \
        .github/workflows/determinism.yml package.json
git commit -m "test(determinism): hash-pinned replay across 8 seeds"
git push -u origin test/determinism-replay
gh pr create --base develop \
  --title "test(determinism): hash-pinned replay across 8 seeds" \
  --body "Tracks: #130

Adds end-to-end determinism check: 8 seeds × 1000 ticks each, sha256
of the bus event stream, asserted against a committed baseline.json.
Same vitest file handles both assertion (default) and baseline-write
(--write-baseline argv flag) modes, so no tsx runtime is needed.
Weekly cron + push-to-develop trigger.

Ticks row 6 of the umbrella tracker."
```

- [ ] **Step 12: Tick tracker row 6 in the same PR (amend + force-with-lease)**

```diff
-| 6   | [quality-determinism-replay.md](./2026-04-26-quality-determinism-replay.md) | Weekly + push hash-pinned replay across 8 seeds with committed baseline | weekly + push | no (tests/) | - [ ] not started |
+| 6   | [quality-determinism-replay.md](./2026-04-26-quality-determinism-replay.md) | Weekly + push hash-pinned replay across 8 seeds with committed baseline | weekly + push | no (tests/) | - [x] shipped via #NNN |
```

## Acceptance criteria

- `npm run determinism:replay` passes for all 8 seeds locally.
- Three consecutive local runs produce identical results (no flake).
- `.github/workflows/determinism.yml` runs green on the merge push.
- Tracker row 6 is `[x]`.

## Baseline-drift handling

Any future library change that legitimately alters trace contents
(new event type, reordered tick stage) invalidates `baseline.json`.
Treat that as an explicit re-baseline step in the SAME PR that
changes behavior:

```bash
npm run determinism:baseline
git diff tests/determinism/baseline.json   # inspect the digest changes
git add tests/determinism/baseline.json
```

Never bypass the assertion or weaken it to match new digests
silently.
