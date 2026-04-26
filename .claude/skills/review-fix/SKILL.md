---
name: review-fix
description: Ingests one or all open findings from a review-bot tracker issue (one issue per scheduled run, label `review-bot`) and produces a worktree-isolated topic branch + implementation plan per finding. Use when the user says "fix review finding <id>", "pick a finding", "/review-fix <id>", names a finding-ID like `682b557.3`, OR invokes `/review-fix` with no argument (sweeps every unshipped finding in the newest review-bot issue). Does NOT close any tracker issue — every issue stays open as the run's archive and the auto-flip workflow handles shipped state.
---

# review-fix — turn tracker finding(s) into worktree(s) + plan(s)

## Terminology

- **Tracker issue** — any issue carrying the label `review-bot`.
  Each scheduled bot run opens its own issue; the body holds that
  run's full findings block. Sweep mode targets the newest issue;
  single mode scans every issue (open + closed) for the requested
  finding ID. **Never closed by this skill.**
- **Finding** — one `[BLOCKER] / [MAJOR] / [MINOR] / [NIT]` checklist
  item inside a tracker issue's body.
- **Finding ID** — `<head-sha[:7]>.<idx>` (e.g. `682b557.3`). Embedded
  as an HTML comment on each finding's checklist line.
- **Magic line** — `Refs #<issue-number> finding:<id>` in a PR body.
  The contract between this skill's output and the
  `review-fix-shipped` Action. The issue number varies per finding
  — it is always the tracker issue that holds that finding's body.

## Modes

- **Single-finding mode** — user supplies a finding ID (`682b557.3`).
  Runs steps 1 → 6 once for that ID. Default and primary path.
  Step 7 (post-merge cleanup) is user-driven and happens after the
  PR ships.
- **Sweep mode** — user invokes the skill with no argument. Pull the
  newest tracker issue (label `review-bot`, sorted by createdAt),
  parse every `<!-- f:<id> -->` marker in its body, skip ones
  already rendered `- [x]`, and run steps 2 → 5 once per remaining
  finding. Each finding still gets its own worktree + branch + plan
  (one finding = one branch = one PR — sweep just batches the _setup_,
  not the findings themselves). Step 6 prints one combined hand-off
  block; step 7 cleanup is per-finding and runs as each PR ships.

## Workflow at a glance

`review-fix` only owns the **plan-creation** stage. The full lifecycle
of a tracker finding looks like this — the user drives steps 2-6 in
their own shell after this skill hands off, and step 7 is the cleanup
they run after the PR merges:

```text
1. /review-fix [<id>]               ← this skill
     fetches tracker → picks finding → cuts worktree + branch → writes plan

2. cd <worktree>
   /superpowers:writing-plans <plan-path>
     refine plan into chunked tasks

3. /superpowers:executing-plans <plan-path>
     TDD implementation, one task at a time

4. npm run verify                   ← pre-PR gate

5. gh pr create --base develop ...
     PR body MUST include the magic line: Refs #<issue> finding:<id>
     (issue number is captured by this skill into the plan frontmatter)

6. Codex review → resolve threads → owner merges PR to develop

7. Post-merge cleanup (this skill, §7 below)
     prune worktree · delete branch · refresh develop
     `review-fix-shipped` Action ticks the tracker line and appends
     `(shipped in #<PR>)` automatically — do NOT edit the issue.
```

## Before you start

Confirm with the user:

1. **Finding ID (single mode only)** — exact form `<sha7>.<idx>`. If
   they paste a free-text description instead, refuse and ask them to
   grab the ID from
   `gh issue list --label review-bot --limit 5` then
   `gh issue view <n>`. In sweep mode (no-arg invocation), skip this
   check.
2. **Already shipped?** — if the tracker line for the chosen ID renders
   `- [x]`, refuse (single mode) or silently skip (sweep mode) and tell
   them which PR shipped it (the line carries `(shipped in #N)`).
3. **Worktree clear?** — if `.worktrees/fix-review-<slug>` already
   exists, refuse (single mode) or skip that finding with a logged
   warning (sweep mode). The user resolves collisions via
   `git worktree remove` or by picking a different finding.

## Steps

### 1. Locate the finding(s)

Both modes share the same fetch step. Node 22 is a hard project
requirement (`.nvmrc`), so the parser is a checked-in script at
`scripts/review-fix-parse.mjs`. **Do not** try to filter the issues
JSON inline with `gh --jq`, `jq`, `node -e` heredocs, or `grep | sed`.
The recipe below dodges four real footguns:

1. `jq` is not installed by default on Windows or many CI images, so
   the skill must not depend on it.
2. Windows Git Bash maps `/tmp` for shell builtins but native Node
   resolves the same path to `D:\tmp` (which usually does not exist).
   Cache files therefore live under `.review-fix-cache/` in the repo
   root (gitignored), not `/tmp` or `${HOME}`.
3. Finding-marker text can appear inside another finding's
   `<details>` body or quoted diff. The script only treats top-level
   checklist lines (`^- \[[ x]\] `) as finding boundaries.
4. Issues with `--label review-bot` may include the cosmetic PR
   label too; `gh issue list` only returns true issues, but make
   sure the JSON shape is the issue list output (objects with
   `number`, `body`, `url`, `createdAt`), not the PR list.

Fetch every review-bot issue once into the project-local cache:

```bash
mkdir -p .review-fix-cache
gh issue list --label review-bot --state all \
  --json number,body,url,createdAt --limit 50 \
  > .review-fix-cache/issues.json
```

**Single-finding mode.** Pass the ID via `--id`. The parser scans
every issue in the cache (newest first) for that marker, so backlog
findings on older tracker issues stay reachable — sweep mode only
ever picks the newest issue, but single mode must not.

```bash
ID="<sha7>.<idx>"            # e.g. 682b557.3
node scripts/review-fix-parse.mjs .review-fix-cache/issues.json \
  --id "${ID}" \
  > .review-fix-cache/finding.json
```

Parser exit codes (single mode):

- `0` → match written to `finding.json` as
  `{issueNumber, issueUrl, createdAt, finding: {…}}`.
- `1` → ID not found in any review-bot issue. Refuse with
  `Finding ${ID} not found in any review-bot issue`.
- `2` → bad CLI args (e.g. user pasted a free-text description).
  Refuse and ask them to grab the ID from
  `gh issue list --label review-bot --limit 5`.
- `3` → ID found but already shipped. The script's stderr already
  says `Finding <id> already shipped in #<PR>`; surface it and stop.

**Sweep mode (no argument).** Run the parser without `--id` to get
every finding from the newest tracker issue:

```bash
node scripts/review-fix-parse.mjs .review-fix-cache/issues.json \
  > .review-fix-cache/parsed.json
```

Sweep output: `{issueNumber, issueUrl, createdAt, findings: [Finding, …]}`.
Exit 1 with `No review-bot issue contains findings — nothing to sweep`
if every issue body is empty or summary-only — surface that to the
user and stop.

For each entry in `parsed.json` `.findings[]`:

- `shipped === true` → log `Skipping <id> (shipped in #<shippedPr>)`
  and continue.
- `.worktrees/fix-review-<slug>` already exists → log
  `Skipping <id> (worktree exists at <path>)` and continue.
- Otherwise run steps 2 → 5 for that finding.

`Finding` shape (both modes):

```json
{
  "id": "<sha7>.<idx>",
  "shipped": false,
  "shippedPr": null,
  "severity": "BLOCKER" | "MAJOR" | "MINOR" | "NIT",
  "path": "src/foo/Bar.ts:143",
  "title": "<one-line title>",
  "body": "<verbatim <details>...</details> chunk>"
}
```

### 2. Extract finding fields

`scripts/review-fix-parse.mjs` already split the chosen finding into
`{id, shipped, shippedPr, severity, path, title, body}`. Read those
fields from `.review-fix-cache/finding.json` `.finding` (single mode)
or from `.review-fix-cache/parsed.json` `.findings[i]` (sweep mode).
Do not re-parse the issue body by hand — the regex lives in the
script.

The parser already hard-fails single mode on `shipped === true`
(exit 3). In sweep mode, you must perform the equivalent skip
yourself (step 1).

Capture `issueNumber` from the same JSON — it is the tracker issue
that holds this finding, and step 5 / 6 substitute it into the plan
frontmatter and PR magic line. Sweep mode shares one
`issueNumber` across every finding (they all come from the same
newest issue); single mode's `issueNumber` is whichever issue the
matching finding lives in.

### 3. Compute slug + paths

The slug always ends with the finding's `<sha7>-<idx>` so two
findings in the same tracker issue that happen to share a
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
tracker: '#<issueNumber>'
severity: <BLOCKER|MAJOR|MINOR|NIT>
---

# Fix review finding `<id>` — <title>

## Source

From `#<issueNumber>` (<issueUrl>), finding `<id>`:

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
- PR body MUST contain on its own line: `Refs #<issueNumber> finding:<id>`.
- PR body MUST NOT contain `Closes #<issueNumber>` / `Fixes #<issueNumber>`.
- Changeset required if behavior changes (`npm run changeset`).
```

### 6. Hand off

The hand-off message has three sections so the user always knows
what's been done, what they do next, and what runs automatically.
Use these exact headings — they're what the user scans for.

**Single-finding mode.** Print:

```text
✅ Done by /review-fix:
  - Cached review-bot issues to .review-fix-cache/issues.json
  - Picked finding <id> from #<issueNumber> (<issueUrl>)
  - Cut branch <branch> off origin/develop
  - Created worktree at <worktree-dir> (npm install complete)
  - Wrote plan at <plan-path>

▶ You do next:
  1. cd <worktree-dir>
  2. /superpowers:writing-plans <plan-path>
  3. /superpowers:executing-plans <plan-path>          (TDD loop)
  4. npm run verify                                    (pre-PR gate)
  5. gh pr create --base develop  --title "..."  --body "..."
       PR body MUST include this line on its own:
         Refs #<issueNumber> finding:<id>
  6. After PR merges: run the cleanup commands in §7 of the skill
     (or re-invoke /review-fix; the skill prints them again).

ℹ️ What happens automatically:
  - The `review-fix-shipped` Action ticks the tracker line `[x]` and
    appends `(shipped in #<your-pr>)` once the PR merges. Do NOT
    edit the tracker issue body yourself.
```

**Sweep mode.** One block listing every plan + every skip:

```text
Sweep of #<issueNumber>: <N> findings processed.

✅ Plans written:
  - <id-1>  →  <plan-path-1>  (branch <branch-1>, worktree <worktree-dir-1>)
  - <id-2>  →  <plan-path-2>  (branch <branch-2>, worktree <worktree-dir-2>)

⏭  Skipped:
  - <id-3>  (shipped in #N)
  - <id-4>  (worktree exists at <path>)

▶ You do next: pick one worktree at a time and run the same 6-step
  loop documented in single-finding hand-off. One PR per finding.
  Run /verify and open each PR in parallel; do NOT batch findings.

ℹ️ Post-merge cleanup is per-finding too — see §7.
```

**Do not** invoke `superpowers:writing-plans` automatically. The user
runs it after reviewing each plan.

### 7. Post-merge cleanup

After a PR for a finding merges, the user runs these commands from
the **main repo** (`D:\Projects\agent-library`), NOT from the
worktree (you can't remove a worktree you're sitting inside). The
skill should print this block verbatim with `<slug>` and `<branch>`
substituted for the finding being cleaned up.

```bash
# 1. Hop back to the main repo and refresh develop
cd <main-repo-root>
git switch develop
git pull --ff-only origin develop

# 2. Drop the worktree (frees the path under .worktrees/)
git worktree remove .worktrees/fix-review-<slug>

# 3. Delete the local topic branch (already merged via squash)
git branch -d fix/review-bot-<slug>

# 4. Delete the remote topic branch — only if GitHub didn't already
#    auto-delete it on merge. Safe to ignore the error if it's gone.
git push origin --delete fix/review-bot-<slug> 2>/dev/null \
  || echo "Remote branch already removed (auto-delete on merge)."

# 5. Prune stale tracking refs so `git branch -a` stays clean
git fetch --prune origin
```

**Sweep cleanup.** If multiple PRs merged in a batch, repeat the
block above per `<slug>`. The user can list candidate worktrees
with `git worktree list` and cross-check against `gh pr list
--state merged --search "Refs # finding:" --limit 20`.

**What the skill does NOT touch:**

- The tracker issue body. The `review-fix-shipped` Action edits it
  post-merge. Manual edits race the Action and corrupt the
  `(shipped in #N)` rendering.
- The `.review-fix-cache/` directory. It's gitignored and cheap to
  rebuild on the next run; leaving it speeds up the next sweep.

## Do not

- Do NOT open the PR. PR creation belongs to the implementation
  session, not the plan session.
- Do NOT close any tracker issue. Do NOT add
  `Closes #<issueNumber>` / `Fixes #<issueNumber>` anywhere.
- Do NOT edit the tracker issue body from the skill — only the
  `review-fix-shipped` Action edits issue bodies, and only
  post-merge.
- Do NOT batch findings into a single branch / PR. One finding = one
  branch = one PR. Sweep mode produces N branches + N plans, never a
  combined plan.
- Do NOT use `git worktree add -B` (force). Surface conflicts to the
  user.
