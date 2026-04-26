---
name: review-fix
description: Ingests one or all open findings from the rolling daily-code-review tracker issue (`#87 Daily code review — develop`) and produces a worktree-isolated topic branch + implementation plan per finding. Use when the user says "fix review finding <id>", "pick a finding", "/review-fix <id>", names a finding-ID like `682b557.3`, OR invokes `/review-fix` with no argument (sweeps every unshipped finding in the latest tracker comment). Does NOT close the tracker issue — the tracker is append-only and the auto-flip workflow handles shipped state.
---

# review-fix — turn tracker finding(s) into worktree(s) + plan(s)

## Terminology

- **Tracker issue** — `#87 Daily code review — develop`. Long-lived,
  one comment per scheduled bot run, body holds the canonical
  `Last reviewed SHA`. **Never closed by this skill.**
- **Finding** — one `[BLOCKER] / [MAJOR] / [MINOR] / [NIT]` checklist
  item inside a bot comment.
- **Finding ID** — `<head-sha[:7]>.<idx>` (e.g. `682b557.3`). Embedded
  as an HTML comment on each finding's checklist line.
- **Magic line** — `Refs #87 finding:<id>` in a PR body. The
  contract between this skill's output and the
  `review-fix-shipped` Action.

## Modes

- **Single-finding mode** — user supplies a finding ID (`682b557.3`).
  Runs steps 1 → 6 once for that ID. Default and primary path.
- **Sweep mode** — user invokes the skill with no argument. Pull the
  most recent comment on `#87` that contains finding markers (skip
  no-op comments), parse every `<!-- f:<id> -->` marker, skip ones
  already rendered `- [x]`, and run steps 2 → 5 once per remaining
  finding. Each finding still gets its own worktree + branch + plan
  (one finding = one branch = one PR — sweep just batches the _setup_,
  not the findings themselves). At the end, print a single hand-off
  summary listing every plan written.

## Before you start

Confirm with the user:

1. **Finding ID (single mode only)** — exact form `<sha7>.<idx>`. If
   they paste a free-text description instead, refuse and ask them to
   grab the ID from `gh issue view 87 --comments`. In sweep mode
   (no-arg invocation), skip this check.
2. **Already shipped?** — if the tracker line for the chosen ID renders
   `- [x]`, refuse (single mode) or silently skip (sweep mode) and tell
   them which PR shipped it (the comment line carries `(shipped in #N)`).
3. **Worktree clear?** — if `.worktrees/fix-review-<slug>` already
   exists, refuse (single mode) or skip that finding with a logged
   warning (sweep mode). The user resolves collisions via
   `git worktree remove` or by picking a different finding.

## Steps

### 1. Locate the finding(s)

Both modes share the same fetch + parse step. Node 22 is a hard
project requirement (`.nvmrc`), so the parser is a checked-in script
at `scripts/review-fix-parse.mjs`. **Do not** try to filter the
comments JSON inline with `gh --jq`, `jq`, `node -e` heredocs, or
`grep | sed`. The recipe below dodges five real footguns:

1. `gh api --paginate --slurp --jq` is rejected by current `gh`
   versions ("the `--slurp` option is not supported with `--jq` or
   `--template`"). Slurp must run with no `--jq` filter.
2. `--slurp` returns an array-of-pages (`[[...page1...], [...page2...]]`),
   not a flat comment list. The script flattens; do not assume flat.
3. `jq` is not installed by default on Windows or many CI images, so
   the skill must not depend on it.
4. Windows Git Bash maps `/tmp` for shell builtins but native Node
   resolves the same path to `D:\tmp` (which usually does not exist).
   Cache files therefore live under `.review-fix-cache/` in the repo
   root (gitignored), not `/tmp` or `${HOME}`.
5. Finding-marker text can appear inside another finding's
   `<details>` body or quoted diff. The script only treats top-level
   checklist lines (`^- \[[ x]\] `) as finding boundaries.

```bash
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
mkdir -p .review-fix-cache
gh api "repos/${REPO}/issues/87/comments" --paginate --slurp \
  > .review-fix-cache/comments.json
node scripts/review-fix-parse.mjs .review-fix-cache/comments.json \
  > .review-fix-cache/parsed.json
```

`parsed.json` schema (one object — most recent comment with findings):

```json
{
  "commentId": 4321324736,
  "commentUrl": "https://github.com/<owner>/<repo>/issues/87#issuecomment-...",
  "createdAt": "2026-04-26T05:21:55Z",
  "findings": [
    {
      "id": "<sha7>.<idx>",
      "shipped": false,
      "shippedPr": null,
      "severity": "BLOCKER" | "MAJOR" | "MINOR" | "NIT",
      "path": "src/foo/Bar.ts:143",
      "title": "<one-line title>",
      "body": "<verbatim <details>...</details> chunk>"
    }
  ]
}
```

The script exits 1 with `No comment on the tracker contains findings`
if every comment is a no-op summary — surface that to the user and
stop.

**Single-finding mode.** Pick the entry whose `id` matches the
user-provided ID:

```bash
ID="<sha7>.<idx>"            # e.g. 682b557.3
node -e "const d=JSON.parse(require('fs').readFileSync('.review-fix-cache/parsed.json','utf8')); const f=d.findings.find(x=>x.id===process.argv[1]); if(!f){console.error('Finding '+process.argv[1]+' not found in #'+d.commentId);process.exit(1)} if(f.shipped){console.error('Finding '+f.id+' already shipped in #'+f.shippedPr);process.exit(2)} process.stdout.write(JSON.stringify(f,null,2))" "${ID}" \
  > .review-fix-cache/finding.json
```

If the user pasted a free-text description instead of `<sha7>.<idx>`:
refuse and ask them to grab the ID from the tracker comment (or
`gh issue view 87 --comments`).

**Sweep mode (no argument).** Iterate `.findings[]` from
`parsed.json`. For each entry:

- `shipped === true` → log `Skipping <id> (shipped in #<shippedPr>)`
  and continue.
- `.worktrees/fix-review-<slug>` already exists → log
  `Skipping <id> (worktree exists at <path>)` and continue.
- Otherwise run steps 2 → 5 for that finding.

### 2. Extract finding fields

`scripts/review-fix-parse.mjs` already split the chosen finding into
`{id, shipped, shippedPr, severity, path, title, body}`. Read those
fields from `.review-fix-cache/finding.json` (single mode) or from
`.review-fix-cache/parsed.json` `.findings[i]` (sweep mode). Do not
re-parse the comment body by hand — the regex lives in the script.

The parser already hard-fails single mode on `shipped === true`. In
sweep mode, you must perform the equivalent skip yourself (step 1).

### 3. Compute slug + paths

The slug always ends with the finding's `<sha7>-<idx>` so two
findings in the same tracker comment that happen to share a
severity + first-4-title-words prefix get distinct paths. Without
that suffix, sweep mode would create the worktree for finding A,
then silently skip finding B as an "existing worktree" collision.

```text
slug-base     = kebab(severity-lowercased + first 4 words of title), trim ≤ 38 chars
slug          = <slug-base>-<sha7>-<idx>
worktree-dir  = .worktrees/fix-review-<slug>
branch        = fix/review-bot-<slug>
plan-path     = docs/plans/YYYY-MM-DD-review-bot-<slug>.md   (UTC date)
```

Example for `682b557.1` (`[BLOCKER]` `LlmProviderPort.ts` interface→type sweep):

```text
slug-base     = blocker-llmproviderport-interface-to-type
slug          = blocker-llmproviderport-interface-to-type-682b557-1
worktree-dir  = .worktrees/fix-review-blocker-llmproviderport-interface-to-type-682b557-1
branch        = fix/review-bot-blocker-llmproviderport-interface-to-type-682b557-1
plan-path     = docs/plans/2026-04-25-review-bot-blocker-llmproviderport-interface-to-type-682b557-1.md
```

### 4. Create the worktree + branch

```bash
git fetch origin develop
git worktree add <worktree-dir> -b <branch> origin/develop
cd <worktree-dir>
npm install
```

If `git worktree add` fails because the branch already exists (e.g.
prior aborted run), surface the error verbatim — do **not** retry
with `-B` (force) since that would silently rewind work.

### 5. Write the plan file

Create `<worktree-dir>/<plan-path>` with frontmatter + finding-quoted
body. The `tracker` value MUST be quoted — `#` opens a YAML comment.

```markdown
---
date: YYYY-MM-DD
slug: review-bot-<slug>
finding-id: <sha7>.<idx>
tracker: '#87'
severity: <BLOCKER|MAJOR|MINOR|NIT>
---

# Fix review finding `<id>` — <title>

## Source

From `#87` comment <comment-id>, finding `<id>`:

> **[<SEVERITY>]** `<path>` — <title>
>
> <quoted body, including diff blocks, verbatim>

## Acceptance

- Apply the bot's proposed fix (see body above).
- Add or update tests covering the new code paths.
- `npm run verify` passes locally.
- Codex review on the PR is acknowledged or rebutted on each thread.

## Rollout

- Branch: `fix/review-bot-<slug>` (already cut by review-fix skill).
- PR base: `develop`.
- PR body MUST contain on its own line: `Refs #87 finding:<id>`.
- PR body MUST NOT contain `Closes #87` / `Fixes #87`.
- Changeset required if behavior changes (`npm run changeset`).
```

### 6. Hand off

**Single-finding mode.** Print exactly:

```text
Plan written to <plan-path> on branch <branch> in <worktree-dir>.
Next: cd <worktree-dir> && /superpowers:writing-plans <plan-path>
```

**Sweep mode.** Print one summary block listing every plan written
plus every finding skipped (and why). Format:

```text
Sweep of #87 latest comment: <N> findings processed.

Plans written:
  - <id-1>  →  <plan-path-1>  (branch <branch-1>, worktree <worktree-dir-1>)
  - <id-2>  →  <plan-path-2>  (branch <branch-2>, worktree <worktree-dir-2>)

Skipped:
  - <id-3>  (shipped in #N)
  - <id-4>  (worktree exists at <path>)

Next: pick a worktree and run /superpowers:writing-plans <plan-path>
inside it. One PR per finding.
```

**Do not** invoke `superpowers:writing-plans` automatically. The user
runs it after reviewing each plan.

## Do not

- Do NOT open the PR. PR creation belongs to the implementation
  session, not the plan session.
- Do NOT close the tracker issue. Do NOT add `Closes #87` / `Fixes #87`
  anywhere.
- Do NOT edit the tracker comment from the skill — only the
  `review-fix-shipped` Action edits comments, and only post-merge.
- Do NOT batch findings into a single branch / PR. One finding = one
  branch = one PR. Sweep mode produces N branches + N plans, never a
  combined plan.
- Do NOT use `git worktree add -B` (force). Surface conflicts to the
  user.
