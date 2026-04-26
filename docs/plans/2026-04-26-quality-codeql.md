# Quality automation — CodeQL weekly + push scan

> **Tracks:** [#130](https://github.com/Luis85/agentonomous/pull/130)
> (umbrella) · row 1 of
> [`2026-04-26-quality-automation-routines.md`](./2026-04-26-quality-automation-routines.md)
>
> **Branch (this row):** cut a fresh worktree off `origin/develop` —
> e.g. `ci/codeql-weekly` under `.worktrees/ci-codeql-weekly`. Do NOT
> branch off the tracker's `chore/quality-automation-routines` branch.

**Goal:** Add a weekly + push-to-`develop`/`main` CodeQL JS/TS scan
using the `security-and-quality` query suite, pinned to commit SHAs.

**Why first:** single file, GitHub-native, zero new deps. Smallest
possible win.

## Files

- Create: `.github/workflows/codeql.yml`

## Steps

- [ ] **Step 1: Resolve SHAs for `actions/checkout@v6` and
  `github/codeql-action/{init,analyze}@v4`** (or current major)

Source the `resolve_action_sha` helper from the umbrella's
[Verification gate](./2026-04-26-quality-automation-routines.md#verification-gate-shared)
section, then:

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

- [ ] **Step 2: Write `.github/workflows/codeql.yml`**

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

- [ ] **Step 3: Local actionlint pass**

```bash
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color .github/workflows/codeql.yml
```

Expected: no output (clean).

- [ ] **Step 4: Verify locally that the existing gate is unaffected**

```bash
npm run verify
```

Expected: same pass set as `develop` HEAD.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/codeql.yml
git commit -m "ci(codeql): add weekly + push CodeQL JS/TS scan"
```

- [ ] **Step 6: Push and open PR**

```bash
git push -u origin ci/codeql-weekly
gh pr create --base develop \
  --title "ci(codeql): add weekly + push CodeQL JS/TS scan" \
  --body "Tracks: #130

Adds a CodeQL JS/TS scan that runs on every push and PR to develop/main
plus a Mondays-06:00-UTC weekly cron, using the security-and-quality
query suite. All actions pinned to 40-char commit SHAs per the repo's
supply-chain rule.

Ticks row 1 of the umbrella tracker."
```

- [ ] **Step 7: Tick the tracker row**

In the same PR, edit
[`2026-04-26-quality-automation-routines.md`](./2026-04-26-quality-automation-routines.md)
tracker table row 1:

```diff
-| 1   | [quality-codeql.md](./2026-04-26-quality-codeql.md) | Weekly + push CodeQL JS/TS scan, `security-and-quality` query suite | weekly + push | no | - [ ] not started |
+| 1   | [quality-codeql.md](./2026-04-26-quality-codeql.md) | Weekly + push CodeQL JS/TS scan, `security-and-quality` query suite | weekly + push | no | - [x] shipped via #NNN |
```

Amend the existing commit (not a new one):

```bash
git add docs/plans/2026-04-26-quality-automation-routines.md
git commit --amend --no-edit
git push --force-with-lease
```

- [ ] **Step 8: Confirm the workflow runs**

Once merged into `develop`, watch the Actions tab for a `CodeQL /
Analyze (javascript-typescript)` run on the merge push. Expected:
green within ~5 min.

## Acceptance criteria

- `.github/workflows/codeql.yml` exists on `develop`.
- The next push to `develop` triggers a CodeQL run that completes
  successfully.
- Tracker row 1 in the umbrella plan is `[x]`.
