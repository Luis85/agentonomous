# Quality automation routines — implementation plan

> **For agentic workers:** REQUIRED: follow this plan top-to-bottom on
> branch `chore/quality-automation-routines` (worktree
> `.worktrees/chore-quality-automation`). Steps use checkbox (`- [ ]`)
> syntax for tracking. The PR opens **draft** with this plan as its body
> reference; flip to ready-for-review only after every row below is
> checked off and `npm run verify` is green.

**Goal:** Close known quality / supply-chain / drift gaps not covered by
the existing CI gate or the daily-code-review + weekly-docs-review
routines, by adding seven new automation surfaces (six CI/cron jobs +
three cloud-routine prompts).

**Architecture:**

- **GitHub Actions workflows** (`.github/workflows/*.yml`) for jobs that
  need to run inside CI infra (CodeQL, mutation testing, Playwright,
  bundle-size trend, determinism replay).
- **Cloud-routine prompt directories** (`docs/<bot-name>/PROMPT.md` +
  `README.md`) for jobs that need an LLM-driven agent (dependency
  triage, action SHA bumps, plan reconciliation). Same shape as the
  existing `docs/review-bot/` and `docs/docs-review-bot/`.
- **No core library changes.** All additions live under `.github/`,
  `docs/`, `tests/determinism/`, and `examples/nurture-pet/`. No
  `src/**` edits. No changesets needed (tooling-only PR).

**Tech stack:**

- GitHub Actions, Dependabot, CodeQL.
- StrykerJS (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`)
  for mutation testing.
- Playwright (`@playwright/test`) for demo smoke.
- Existing `scripts/bump-actions.mjs`, `scripts/coverage-pr-comment.mjs`
  pattern for any new helper scripts.

**Out of scope (this plan):**

- Stale-branch cleaner — explicitly deferred per owner decision
  (2026-04-26).
- Type-coverage report, license/SBOM audit, mutation testing on
  examples — punt to a future plan if value materializes.

---

## File structure

### New files

| Path | Responsibility |
| --- | --- |
| `.github/workflows/codeql.yml` | Weekly + push-to-develop CodeQL JS/TS scan. |
| `.github/workflows/mutation.yml` | Weekly Stryker run on `develop`; uploads HTML report artifact. |
| `.github/workflows/demo-smoke.yml` | Nightly Playwright headless run against built demo. |
| `.github/workflows/bundle-size-trend.yml` | Weekly snapshot of `npx size-limit --json` to a committed `docs/metrics/bundle-trend.jsonl`. |
| `.github/workflows/determinism.yml` | Weekly replay of seeded pet sims; hash-compares `DecisionTrace` against committed baseline. |
| `stryker.config.mjs` | Stryker config (vitest runner, sane mutate globs, threshold). |
| `examples/nurture-pet/playwright.config.ts` | Playwright config for the demo smoke spec. |
| `examples/nurture-pet/tests/smoke/golden-path.spec.ts` | Click Feed/Pet/Sleep/Train; assert HUD updates + no console errors. |
| `tests/determinism/replay.test.ts` | Vitest-driven replay across N seeds; emits one `sha256(trace-stream)` per seed. |
| `tests/determinism/baseline.json` | Committed map `{ seedString: sha256 }` (ground truth). |
| `tests/determinism/replay.ts` | Replay harness (pure function: seed → trace stream → sha). |
| `docs/metrics/bundle-trend.jsonl` | Append-only JSONL: one row per weekly snapshot. Created by row 5. |
| `docs/dep-triage-bot/PROMPT.md` | System prompt for the weekly Dependabot triage routine. |
| `docs/dep-triage-bot/README.md` | How the routine consumes `PROMPT.md`, where outputs go. |
| `docs/actions-bump-bot/PROMPT.md` | System prompt for the weekly action-SHA bump routine. |
| `docs/actions-bump-bot/README.md` | Same shape as above. |
| `docs/plan-recon-bot/PROMPT.md` | System prompt for the monthly plan-vs-shipped reconciliation routine. |
| `docs/plan-recon-bot/README.md` | Same shape as above. |
| `scripts/append-size-snapshot.mjs` | Read `npx size-limit --json` stdin, append a row to `docs/metrics/bundle-trend.jsonl`. |

### Modified files

| Path | Change |
| --- | --- |
| `package.json` | Add devDeps: `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`. Add scripts: `mutation`, `mutation:report`, `determinism:replay`, `determinism:baseline`. |
| `examples/nurture-pet/package.json` | Add devDep `@playwright/test`; script `smoke`. |
| `.gitignore` | Ignore `reports/mutation/`, `playwright-report/`, `examples/nurture-pet/playwright-report/`, `examples/nurture-pet/test-results/`. |
| `.github/dependabot.yml` | Group npm minor + patch updates so the triage routine sees one PR per ecosystem-week, not N. |
| `CONTRIBUTING.md` | Brief mention of mutation / smoke / determinism scripts in the dev-loop section. |
| `README.md` | One-line bullet under the badges/quality section: links to the trend file + bot prompts. |

### Branching / PR shape

This plan ships on **one** branch (`chore/quality-automation-routines`)
under **one** draft PR (`docs(plans): quality-automation routines + ...`).
Per owner direction, every row below lands as its own commit on this
branch. The PR is flipped to ready-for-review only after the final row
checks off and `npm run verify` is green.

> **Why one PR, not the usual one-per-row?** This batch is mostly
> additive infra (workflows + prompts + dev-deps) with near-zero blast
> radius on the library. Splitting eight tooling-only rows into eight
> PRs would burn ~8 Codex review cycles for marginal review benefit.
> When a row touches `src/**` (none of them do here) future plans
> revert to the standard one-row-per-PR rule.

---

## Verification gate per row

Each row ends with `npm run verify` passing locally before commit. New
workflows must additionally be **lint-clean under `actionlint`**
(already wired into CI) — run locally with:

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color
```

…or push the commit and watch the existing `Lint workflows (actionlint)`
job. New action references must use full 40-char SHAs with a trailing
`# vX.Y.Z` comment (per the supply-chain rule in the existing CI
header).

### Resolve an action tag → commit SHA (peel-aware)

> **Why a helper, not just `gh api .../commits/<tag>`?** Many actions
> publish **annotated tags**. `gh api .../git/refs/tags/<tag>` on an
> annotated tag returns the tag-object SHA, not the underlying commit.
> Pinning that tag-object SHA in `uses:` produces a non-resolvable
> reference. The repo's own `scripts/bump-actions.mjs` already handles
> this via `object.type` + a `git/tags/<sha>` dereference (see lines
> 142–195 of that script). Use the helper below for every SHA-resolve
> step in this plan.

Drop this Bash function into your shell (or a scratch file you
`source`) before working any row that needs SHAs:

```bash
# Resolve <owner>/<repo>@<tag> → 40-char commit SHA. Peels annotated
# tags. Echoes the SHA on stdout; non-zero exit on missing/unsupported.
resolve_action_sha() {
  local owner="$1" repo="$2" tag="$3"
  if [[ -z "$owner" || -z "$repo" || -z "$tag" ]]; then
    printf 'usage: resolve_action_sha <owner> <repo> <tag>\n' >&2
    return 2
  fi
  local payload kind sha
  payload="$(gh api "repos/${owner}/${repo}/git/ref/tags/${tag}")" || return 1
  kind="$(jq -r '.object.type' <<<"${payload}")"
  sha="$(jq -r '.object.sha'  <<<"${payload}")"
  case "${kind}" in
    commit) printf '%s\n' "${sha}" ;;
    tag)    gh api "repos/${owner}/${repo}/git/tags/${sha}" --jq '.object.sha' ;;
    *)      printf 'unsupported ref type %s for %s/%s@%s\n' \
              "${kind}" "${owner}" "${repo}" "${tag}" >&2; return 1 ;;
  esac
}
```

Sanity check the helper against a known-annotated tag and a known-
lightweight tag before relying on it:

```bash
resolve_action_sha actions checkout v6.0.2
resolve_action_sha actions setup-node v6.4.0
```

Both must echo a 40-char hex string. Anything else → fix the helper
before continuing.

> **Lazier alternative.** `node scripts/bump-actions.mjs --help` does
> not yet expose a one-shot `--resolve` mode (see the row 7 follow-up
> in `MEMORY.md` if it lands). Until it does, use this helper.

---

## Chunk 1: Bootstrap (rows 0–1)

### Task 0: Land the plan + open the draft PR

**Files:**
- Create: `docs/plans/2026-04-26-quality-automation-routines.md` (this file).

- [ ] **Step 0.1: Confirm worktree on `chore/quality-automation-routines`**

```bash
git -C .worktrees/chore-quality-automation rev-parse --abbrev-ref HEAD
# expected: chore/quality-automation-routines
```

- [ ] **Step 0.2: Stage and commit the plan**

```bash
git -C .worktrees/chore-quality-automation add docs/plans/2026-04-26-quality-automation-routines.md
git -C .worktrees/chore-quality-automation commit -m "docs(plans): quality-automation routines roadmap"
```

- [ ] **Step 0.3: Push branch + open draft PR**

```bash
git -C .worktrees/chore-quality-automation push -u origin chore/quality-automation-routines
gh pr create --draft --base develop \
  --title "chore(quality): add quality-automation routines (CodeQL, mutation, Playwright, …)" \
  --body-file docs/plans/2026-04-26-quality-automation-routines.md
```

Expected: draft PR URL printed, status `Draft`. Note the PR number for
later step `Final.3`.

---

### Task 1: CodeQL weekly + push-to-develop

**Why first:** single file, GitHub-native, zero new deps. Smallest
possible win.

**Files:**
- Create: `.github/workflows/codeql.yml`

- [ ] **Step 1.1: Resolve SHAs for `actions/checkout@v6` and
  `github/codeql-action/{init,analyze}@v4`** (or current major)

Using the peel-aware `resolve_action_sha` helper defined in the
verification-gate section above:

```bash
resolve_action_sha actions checkout v6.0.2
resolve_action_sha github  codeql-action v4
# codeql-action ships init + analyze from the same repo at the same
# tag, so one resolve covers both `uses:` lines.
```

> **Do NOT use `gh api .../git/refs/tags/<tag> --jq '.object.sha'`
> directly** — annotated tags return the tag-object SHA, which makes
> `uses: owner/repo@<sha>` invalid. The helper handles peeling.

Capture each 40-char hex output; use it verbatim in the YAML below
with a trailing `# v6.0.2` / `# v4` comment.

- [ ] **Step 1.2: Write `.github/workflows/codeql.yml`**

```yaml
name: CodeQL

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]
  schedule:
    # Mondays 06:00 UTC — same window as docs-review weekly cadence.
    - cron: '0 6 * * 1'

concurrency:
  group: codeql-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  security-events: write
  actions: read

jobs:
  analyze:
    name: Analyze (javascript-typescript)
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        language: [javascript-typescript]
    steps:
      - uses: actions/checkout@<sha> # v6.0.2
      - uses: github/codeql-action/init@<sha> # v4
        with:
          languages: ${{ matrix.language }}
          # security-and-quality is the broadest default suite that GA
          # supports. security-extended would also work; quality-only
          # would miss CWE-079/CWE-094 patterns we want flagged.
          queries: security-and-quality
      - uses: github/codeql-action/analyze@<sha> # v4
        with:
          category: '/language:${{ matrix.language }}'
```

- [ ] **Step 1.3: Local actionlint pass**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/codeql.yml
```

Expected: no output (clean).

- [ ] **Step 1.4: Verify locally that the gate is unaffected**

```bash
npm run verify
```

Expected: same pass set as `develop`.

- [ ] **Step 1.5: Commit**

```bash
git add .github/workflows/codeql.yml
git commit -m "ci(codeql): add weekly + push CodeQL JS/TS scan"
```

- [ ] **Step 1.6: Push and confirm the workflow runs in Actions tab**

```bash
git push
```

Expected: a `CodeQL / Analyze (javascript-typescript)` run appears for
the push and finishes success.

---

## Chunk 2: Cloud-routine prompts (rows 2–4)

These three rows add prompt directories only — no workflows, no deps,
no library code. Each ships behind `docs/<bot-name>/`. The actual
scheduling happens outside the repo (Claude Cloud cron), same way as
`docs/review-bot/` and `docs/docs-review-bot/`.

### Task 2: Dependabot triage routine prompt

**Files:**
- Create: `docs/dep-triage-bot/PROMPT.md`
- Create: `docs/dep-triage-bot/README.md`
- Modify: `.github/dependabot.yml` — group npm minor+patch into one PR
  per ecosystem-week so the triage routine sees a tractable input.

- [ ] **Step 2.1: Read existing pattern**

```bash
cat docs/docs-review-bot/PROMPT.md   # use as structural template
cat docs/docs-review-bot/README.md
cat .github/dependabot.yml
```

- [ ] **Step 2.2: Update `.github/dependabot.yml`**

Add a `groups:` block on each `package-ecosystem: "npm"` entry so minor
+ patch updates land in a single weekly PR rather than 5–10 separate
ones.

```yaml
# Example shape — adapt to existing keys verbatim.
- package-ecosystem: "npm"
  directory: "/"
  schedule:
    interval: "weekly"
  groups:
    npm-non-major:
      patterns: ["*"]
      update-types: ["minor", "patch"]
```

- [ ] **Step 2.3: Write `docs/dep-triage-bot/PROMPT.md`**

Sections to include (mirror `docs/review-bot/PROMPT.md`):

1. **Role** — "Senior dependency triage. Conservative, not adventurous.
   Goal: drain the Dependabot pile without bricking the build."
2. **Scope this run** — "Open Dependabot PRs targeting `develop`, label
   `dependencies`."
3. **Triage policy** — patch + minor on dev-deps: rebase, run
   `npm run verify`, auto-merge if green. Patch + minor on runtime
   deps: rebase, run verify, leave a one-line approval comment but do
   NOT merge (owner approval required). Major on anything: comment
   with the changelog summary + breaking-change bullet list, leave for
   owner. Peer-deps: never auto-merge.
4. **Hard rules** — never merge a PR that touches `src/**` (means
   Dependabot generated more than a manifest bump, suspicious); never
   bypass `--no-verify`; never amend the Dependabot commit.
5. **Output** — append a one-comment summary on a rolling
   tracker issue `Dependency triage — develop` (label
   `dep-triage-bot`).
6. **Failure handling** — verify fails → comment "verify failed: \<err
   tail\>" on the Dependabot PR + tracker, do not merge.

Use the same idempotency pattern as `docs/review-bot/PROMPT.md`
(rolling issue, append comments, never push direct to develop).

- [ ] **Step 2.4: Write `docs/dep-triage-bot/README.md`**

Mirror `docs/review-bot/README.md`: how the routine consumes the
prompt, where output lives, how to evolve it.

- [ ] **Step 2.5: Commit**

```bash
git add docs/dep-triage-bot/ .github/dependabot.yml
git commit -m "docs(routine): add weekly Dependabot triage prompt"
```

---

### Task 3: Action SHA bump routine prompt

**Files:**
- Create: `docs/actions-bump-bot/PROMPT.md`
- Create: `docs/actions-bump-bot/README.md`

- [ ] **Step 3.1: Confirm `scripts/bump-actions.mjs` exists and works**

```bash
node scripts/bump-actions.mjs
```

Expected: prints any pending bumps (or "no drift") without writing
files. Capture exact output shape — the prompt has to instruct the
agent how to parse it.

- [ ] **Step 3.2: Write `docs/actions-bump-bot/PROMPT.md`**

Mirror the dep-triage prompt structure. Key sections:

1. **Role** — "Action SHA-bump caretaker. Single job: keep
   `.github/workflows/*.yml` action references at their latest
   tags-as-SHA."
2. **Scope this run** — "Run weekly. Inputs come from
   `node scripts/bump-actions.mjs`."
3. **Process** — branch off `develop`
   (`chore/actions-bump-YYYY-MM-DD`), apply each bump, verify
   `actionlint` clean, run `npm run verify`, open one PR with the
   diff. Owner reviews and merges.
4. **Hard rules** — never bump across a major (require explicit owner
   approval); never edit the SHA without re-resolving via `gh api`;
   never alter the trailing `# vX.Y.Z` comment without matching the
   bumped tag.
5. **Output** — single PR per run, body lists each `(action, old SHA,
   new SHA, version label)`. No-op runs: post a one-line comment on the
   tracker issue `Action SHA bumps — develop` and exit.
6. **Failure handling** — verify fails → close branch, comment on
   tracker.

- [ ] **Step 3.3: Write `docs/actions-bump-bot/README.md`**

- [ ] **Step 3.4: Commit**

```bash
git add docs/actions-bump-bot/
git commit -m "docs(routine): add weekly action-SHA bump prompt"
```

---

### Task 4: Plan reconciliation routine prompt

**Why monthly, not weekly:** plans are coarse-grained; a weekly cadence
would mostly produce no-ops. Monthly aligns with how often roadmap
rows complete in batches.

**Files:**
- Create: `docs/plan-recon-bot/PROMPT.md`
- Create: `docs/plan-recon-bot/README.md`

- [ ] **Step 4.1: Read the archive convention**

```bash
cat docs/archive/README.md
ls docs/archive/plans/
ls docs/plans/
```

- [ ] **Step 4.2: Write `docs/plan-recon-bot/PROMPT.md`**

Sections:

1. **Role** — "Plan archivist. Reconcile `docs/plans/*.md` against
   shipped state. Different from docs-review-bot (which audits prose
   drift); this routine answers 'is this plan done?' "
2. **Scope this run** — every file under `docs/plans/`. For each:
   parse roadmap rows, cross-check `git log origin/develop` (and the
   tracker issue if linked) for shipped status, and either (a) leave
   alone if work continues, (b) move to `docs/archive/plans/` via
   `git mv` if every row is shipped or the plan is superseded.
3. **Hard rules** — never delete plan content; only `git mv`. Preserve
   the date prefix. Never archive a plan that has open rows.
4. **Output** — open one PR per run with archive moves, body lists
   each `(plan, last shipped row, archive reason)`. No moves needed:
   post a one-line comment on the tracker issue `Plan reconciliation`
   and exit.
5. **Failure handling** — same pattern as the other routines.

- [ ] **Step 4.3: Write `docs/plan-recon-bot/README.md`**

- [ ] **Step 4.4: Commit**

```bash
git add docs/plan-recon-bot/
git commit -m "docs(routine): add monthly plan reconciliation prompt"
```

---

## Chunk 3: Bundle-size trend (row 5)

Rationale: existing `size-limit-comment` job posts the per-PR delta but
gives no longitudinal view. A weekly snapshot to a committed JSONL
file in `docs/metrics/` lets us graph the trend later (and inspect by
diff today).

### Task 5: Weekly bundle-size trend snapshot

**Files:**
- Create: `scripts/append-size-snapshot.mjs`
- Create: `.github/workflows/bundle-size-trend.yml`
- Create: `docs/metrics/bundle-trend.jsonl` (empty file at first commit)

- [ ] **Step 5.1: Write the snapshot script (TDD)**

Create `scripts/append-size-snapshot.test.mjs` first, then the
implementation. The test feeds the script a fixture `size-limit --json`
output via stdin and asserts:

- Output JSONL has exactly one row.
- Row keys: `iso` (UTC ISO-8601 date), `sha` (7-char head SHA from
  env), `entries` (array of `{name, size, gzip}` from input).
- Existing rows in the target file are preserved; the new row is
  appended.

```js
// scripts/append-size-snapshot.test.mjs
import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('appends one JSONL row from size-limit JSON on stdin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sizesnap-'));
  const target = join(dir, 'bundle-trend.jsonl');
  writeFileSync(target, ''); // empty
  const fixture = JSON.stringify([
    { name: 'core', size: 1234, gzip: 567 },
    { name: 'integrations/excalibur', size: 200, gzip: 100 },
  ]);
  const out = spawnSync(
    process.execPath,
    ['scripts/append-size-snapshot.mjs', '--target', target],
    { input: fixture, env: { ...process.env, GITHUB_SHA: 'abcdef0' } },
  );
  expect(out.status).toBe(0);
  const rows = readFileSync(target, 'utf8').trim().split('\n').filter(Boolean);
  expect(rows).toHaveLength(1);
  const row = JSON.parse(rows[0]);
  expect(row.sha).toBe('abcdef0');
  expect(row.entries).toHaveLength(2);
  expect(row.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});
```

- [ ] **Step 5.2: Run the test (red)**

```bash
npx vitest run scripts/append-size-snapshot.test.mjs
```

Expected: FAIL (`Cannot find module 'scripts/append-size-snapshot.mjs'`).

- [ ] **Step 5.3: Implement `scripts/append-size-snapshot.mjs`**

Argv: `--target <path>`. Reads stdin → JSON. Builds `{iso, sha,
entries}`. Appends one line. Idempotent on identical content (skip if
last line equals new line minus `iso`).

- [ ] **Step 5.4: Re-run the test (green)**

```bash
npx vitest run scripts/append-size-snapshot.test.mjs
```

Expected: PASS.

- [ ] **Step 5.5: Create the empty trend file**

```bash
touch docs/metrics/bundle-trend.jsonl
```

Add a 2-line preamble inside the file? **No.** JSONL by definition has
no header; downstream tools assume one JSON value per line. Keep it
empty.

- [ ] **Step 5.6: Write `.github/workflows/bundle-size-trend.yml`**

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
      - name: Append snapshot row
        env:
          GITHUB_SHA: ${{ github.sha }}
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
> to develop" but explicitly allows post-merge pulls. This is a metrics
> append by github-actions bot, not human work. If branch protection
> on `develop` blocks even bot pushes, switch to: open a PR per run via
> `peter-evans/create-pull-request` and let the dep-triage routine
> auto-merge it. Decide at step 5.7.

- [ ] **Step 5.7: Decide direct-push vs PR-bot path**

```bash
gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/develop/protection 2>&1 | head -20
```

If `required_status_checks` includes `ci-gate` and direct push is
blocked → switch the workflow to open a PR via
`peter-evans/create-pull-request@<sha>` and document the path swap in
this row.

- [ ] **Step 5.8: actionlint + verify**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/bundle-size-trend.yml
npm run verify
```

- [ ] **Step 5.9: Commit**

```bash
git add scripts/append-size-snapshot.mjs scripts/append-size-snapshot.test.mjs \
        docs/metrics/bundle-trend.jsonl .github/workflows/bundle-size-trend.yml
git commit -m "ci(metrics): weekly bundle-size trend snapshot"
```

---

## Chunk 4: Determinism replay (row 6)

Rationale: the determinism rule (`SeededRng` + `ManualClock` ⇒ byte-
identical `DecisionTrace`) is enforced statically by ESLint
(no `Date.now`/`Math.random`) but never tested **end-to-end**. A
hash-pinned replay across N seeds catches non-static violations: a new
helper that secretly reads `performance.now()`, a `Date` constructor
inside a needs policy, etc.

### Task 6: Hash-pinned replay across N seeds

**Files:**
- Create: `tests/determinism/replay.ts`
- Create: `tests/determinism/replay.test.ts`
- Create: `tests/determinism/baseline.json`
- Create: `.github/workflows/determinism.yml`
- Modify: `package.json` — scripts `determinism:replay`,
  `determinism:baseline`.

> **No `tsx` runtime, no extra script.** Earlier drafts of this row
> shelled out via `node --import tsx scripts/run-determinism-replay.mjs`
> to seed `baseline.json`. That required adding `tsx` as a devDep and
> a separate harness file. Both are dropped — the same vitest file
> handles assertion AND baseline-write modes, switched by an argv
> flag passed through `npx vitest -- --write-baseline`. Vitest already
> transpiles TS, so no extra runtime is needed.

- [ ] **Step 6.1: Decide the seed set**

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

- [ ] **Step 6.2: Write `tests/determinism/replay.ts`**

Pure function `replaySeed(seed: string): string` (sha256 hex). Inside:

1. Construct `SeededRng(seed)` + `ManualClock(0)`.
2. Build a default agent via the public test helpers (mirror the
   pattern in `tests/integration/`).
3. Tick 1000 times advancing the clock by 100 ms per tick.
4. Stream every event from the bus into a hash; return the digest.

Use `crypto.createHash('sha256')` from `node:crypto`.

- [ ] **Step 6.3: Write the dual-mode test file (red)**

The same file serves two modes:

- **Assertion mode** (default): each seed digest must equal the
  committed baseline.
- **Write mode** (when `--write-baseline` is passed via vitest argv):
  recompute every digest and overwrite `baseline.json`. No assertions
  — the goal is to capture a new ground truth after a deliberate
  library change.

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

> **Why argv, not an env var?** `npm run` on Windows uses `cmd.exe` by
> default, which does not respect a `WRITE_BASELINE=1 prefix` shell
> idiom. Vitest passes everything after `--` through to
> `process.argv`, so an argv flag is portable without bringing in
> `cross-env`.

- [ ] **Step 6.4: Run the assertion mode (red)**

```bash
npx vitest run tests/determinism/replay.test.ts
```

Expected: FAIL — `baseline.json` does not exist yet, so the
`readFileSync` call throws `ENOENT` before any test runs.

- [ ] **Step 6.5: Generate `baseline.json` once via the same file in
  write mode**

```bash
npx vitest run tests/determinism/replay.test.ts -- --write-baseline
```

Vitest transpiles `replay.ts` + `replay.test.ts` itself, so no `tsx`
or extra harness script is needed. The `--write-baseline` token
arrives in `process.argv`, the test file flips into write mode, and
`baseline.json` is created. Inspect the result:

```bash
cat tests/determinism/baseline.json
```

Expected: an 8-key JSON object, each value a 64-char hex digest.

- [ ] **Step 6.6: Re-run the test (green)**

```bash
npx vitest run tests/determinism/replay.test.ts
```

Expected: PASS for all 8 seeds.

- [ ] **Step 6.7: Run twice in the same shell to confirm stability**

```bash
for i in 1 2 3; do npx vitest run tests/determinism/replay.test.ts; done
```

Expected: PASS PASS PASS. Any flake means the harness is non-
deterministic — fix `replay.ts` rather than weakening the assertion.

- [ ] **Step 6.8: Wire scripts**

```json
// package.json — add to "scripts":
"determinism:replay": "vitest run tests/determinism/replay.test.ts",
"determinism:baseline": "vitest run tests/determinism/replay.test.ts -- --write-baseline"
```

Both scripts are pure `vitest run` invocations — no `tsx`, no
`cross-env`, no separate harness. The argv flag is the only mode
switch.

- [ ] **Step 6.9: Workflow**

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

- [ ] **Step 6.10: actionlint + verify**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/determinism.yml
npm run verify
```

- [ ] **Step 6.11: Commit**

```bash
git add tests/determinism/ \
        .github/workflows/determinism.yml package.json
git commit -m "test(determinism): hash-pinned replay across 8 seeds"
```

---

## Chunk 5: Mutation testing (row 7)

Rationale: existing coverage delta proves *lines ran*. Mutation testing
proves *tests would fail if the line changed*. Pairs with the existing
coverage PR comment to close the "test asserts nothing" loophole.

### Task 7: Stryker weekly run

**Files:**
- Create: `stryker.config.mjs`
- Create: `.github/workflows/mutation.yml`
- Modify: `package.json` (devDeps + scripts)
- Modify: `.gitignore`

- [ ] **Step 7.1: Add devDeps**

```bash
npm install --save-dev --save-exact \
  @stryker-mutator/core@latest \
  @stryker-mutator/vitest-runner@latest
```

Pin exact versions in `package.json`. Update lockfile.

- [ ] **Step 7.2: Write `stryker.config.mjs`**

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

> Threshold seed values are placeholders — the first run produces the
> baseline. After that run lands, replace `break: 55` with `current
> score - 2` so future regressions fail the job but normal noise does
> not. Capture the baseline number in the row's commit message.

- [ ] **Step 7.3: Add scripts to `package.json`**

```json
"mutation": "stryker run",
"mutation:report": "open reports/mutation/mutation.html"
```

- [ ] **Step 7.4: Update `.gitignore`**

```
reports/mutation/
.stryker-tmp/
```

- [ ] **Step 7.5: Run locally to capture the baseline score**

```bash
npm run mutation
```

Expected: prints a score (e.g. "Mutation score: 73.4%"). This is the
baseline. **Update `stryker.config.mjs` `thresholds.break`** to
`floor(score) - 2` and re-run to confirm green.

> Local run on full suite is slow (~15-30 min). If it exceeds 45 min,
> trim `mutate` further (e.g. exclude `src/persistence/` for the first
> pass) and document the carve-out in the row's commit message.

- [ ] **Step 7.6: Workflow**

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

- [ ] **Step 7.7: actionlint + verify**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/mutation.yml
npm run verify
```

> `npm run verify` does NOT include `npm run mutation` — too slow for
> the pre-PR gate. Mutation runs only on the weekly schedule.

- [ ] **Step 7.8: Commit**

```bash
git add stryker.config.mjs .github/workflows/mutation.yml \
        package.json package-lock.json .gitignore
git commit -m "test(mutation): weekly Stryker run on develop (baseline N%)"
```

---

## Chunk 6: Demo Playwright smoke (row 8)

Rationale: existing CI builds the demo (`demo-build` job) but never
runs it. A headless click-through across the golden path catches
runtime regressions that typecheck + bundle don't (tfjs backend probe,
`base` URL handling, vite HTML transform regressions — see
`MEMORY.md → feedback_vite_html_transform`).

### Task 8: Playwright golden-path smoke

**Files:**
- Create: `examples/nurture-pet/playwright.config.ts`
- Create: `examples/nurture-pet/tests/smoke/golden-path.spec.ts`
- Create: `.github/workflows/demo-smoke.yml`
- Modify: `examples/nurture-pet/package.json` — devDep + script
- Modify: `.gitignore`

- [ ] **Step 8.1: Add Playwright to the demo**

```bash
cd examples/nurture-pet
npm install --save-dev --save-exact @playwright/test@latest
npx playwright install --with-deps chromium
cd -
```

Pin `@playwright/test` in `examples/nurture-pet/package.json`. Do NOT
add it to the root `package.json` — the demo manages its own deps
(`MEMORY.md` notes the `file:../..` EISDIR pitfall on Windows).

- [ ] **Step 8.2: `examples/nurture-pet/playwright.config.ts`**

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

- [ ] **Step 8.3: Write `tests/smoke/golden-path.spec.ts`**

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

  // Replace selectors with the actual demo controls — discoverable via
  // `npm run dev` + DevTools. Keep this spec tied to user-facing roles
  // (button names, ARIA labels) not implementation classes.
  await page.getByRole('button', { name: /feed/i }).click();
  await page.getByRole('button', { name: /pet/i }).click();
  await page.getByRole('button', { name: /sleep/i }).click();

  // HUD assertion — pick one stable observable (e.g. "Hunger" stat
  // text changes). Adapt during step 8.4.
  await expect(page.getByTestId('hud-needs')).toContainText(/Hunger/);

  expect(consoleErrors).toEqual([]);
});
```

- [ ] **Step 8.4: Run locally to wire selectors**

```bash
cd examples/nurture-pet
npm run build && npm run preview &
PREVIEW_PID=$!
npx playwright test --headed --project=chromium
kill $PREVIEW_PID
cd -
```

Iterate on selectors until the spec passes. **If the demo lacks stable
testids on the HUD, add them in this same row** (not a separate PR;
the smoke depends on them).

- [ ] **Step 8.5: Add script to `examples/nurture-pet/package.json`**

```json
"smoke": "playwright test"
```

- [ ] **Step 8.6: Update `.gitignore`**

```
examples/nurture-pet/playwright-report/
examples/nurture-pet/test-results/
```

- [ ] **Step 8.7: Workflow**

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

- [ ] **Step 8.8: actionlint + verify (root) + smoke run (demo)**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/demo-smoke.yml
npm run verify
( cd examples/nurture-pet && npm run smoke )
```

- [ ] **Step 8.9: Commit**

```bash
git add examples/nurture-pet/playwright.config.ts \
        examples/nurture-pet/tests/ \
        examples/nurture-pet/package.json \
        examples/nurture-pet/package-lock.json \
        .github/workflows/demo-smoke.yml \
        .gitignore
git commit -m "test(demo): nightly Playwright smoke on golden path"
```

---

## Chunk 7: Final wiring (rows 9–10)

### Task 9: Doc updates

**Files:**
- Modify: `CONTRIBUTING.md`
- Modify: `README.md`

- [ ] **Step 9.1: `CONTRIBUTING.md`**

Add a brief "Quality automation" subsection under the existing dev-loop
section. List `npm run mutation`, `npm run determinism:replay`, and
`( cd examples/nurture-pet && npm run smoke )` with one-line purposes.

- [ ] **Step 9.2: `README.md`**

Add one bullet under the existing Quality / CI section linking to:
- `docs/metrics/bundle-trend.jsonl`
- `docs/dep-triage-bot/README.md`
- `docs/actions-bump-bot/README.md`
- `docs/plan-recon-bot/README.md`

No screenshots, no badges. Keep it terse.

- [ ] **Step 9.3: Commit**

```bash
git add CONTRIBUTING.md README.md
git commit -m "docs: link new quality-automation surfaces"
```

---

### Task Final: Flip PR to ready-for-review

- [ ] **Final.1: Run the full gate one more time**

```bash
npm run verify
( cd examples/nurture-pet && npm run smoke )
npm run determinism:replay
```

Mutation is **not** in this gate — too slow. Owner can spot-check by
running `npm run mutation` if desired.

- [ ] **Final.2: Confirm every checkbox above is ticked**

```bash
grep -E '^- \[ \]' docs/plans/2026-04-26-quality-automation-routines.md
```

Expected: no output (zero unchecked boxes).

- [ ] **Final.3: Mark PR ready**

```bash
gh pr ready <PR-number-from-step-0.3>
```

- [ ] **Final.4: Optional — add a Codex re-review trigger**

```bash
gh pr comment <PR-number> --body "@codex review"
```

Standard pattern from `MEMORY.md → feedback_pr_codex_polling.md`. If
findings come back, address per
`MEMORY.md → feedback_codex_signal_endpoints.md`.

---

## Risk register (read once before starting)

- **Stryker runtime explosion.** If the suite balloons past 45 min on a
  single runner, drop `concurrency` to match the runner's vCPU count
  and / or split the `mutate` glob across two workflow jobs (e.g.
  `src/agent/**` vs. everything else). Don't lower the threshold to
  paper over slowness.
- **Determinism baseline drift.** Any legitimate library change that
  alters trace contents (new event type, reordered tick stage)
  invalidates `baseline.json`. Treat that as an explicit re-baseline
  step in the same PR that changes behavior (run `npm run
  determinism:baseline`, inspect the diff, commit it alongside the
  trace-changing code) — never bypass the assertion or weaken it to
  match the new digests silently.
- **Playwright flake.** The demo loads tfjs which probes WebGL → WASM →
  CPU on startup. In CI on Ubuntu, expect WASM. Allow `retries: 1`
  but never higher; >1 retries hides real flakes.
- **Bot-pushed develop commits.** Row 5 pushes a metrics row directly
  to `develop` from a workflow. If branch protection blocks this
  (likely), pivot to PR-bot path documented in step 5.7. Don't
  weaken protection.
- **Action SHA churn.** Every new workflow added in this PR uses pinned
  SHAs. After this PR merges, the next `actions-bump-bot` run will
  attempt to bump them. That's expected — review that bump PR like any
  other.
- **One PR, one branch.** Owner explicitly approved bundling all eight
  rows on this branch. Project default (`one PR, one concern`) does
  not apply here. If a reviewer flags split-required, point them to
  this plan section.

---

## When to mark this plan shipped

Move this file to `docs/archive/plans/2026-04-26-quality-automation-routines.md`
via `git mv` in the **same commit** that flips the PR to merged (or in
a follow-up `chore(docs)` commit on `develop` if that's not feasible).
Per `MEMORY.md → feedback_docs_alongside_pr.md`.
