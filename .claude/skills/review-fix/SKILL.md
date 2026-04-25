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

**Single-finding mode.** Substitute the user-provided finding ID
(e.g. `682b557.3`) for `${ID}` below before running:

```bash
ID="<sha7>.<idx>"            # e.g. 682b557.3
MARKER="<!-- f:${ID} -->"
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
gh api "/repos/${REPO}/issues/87/comments" --paginate \
  --jq ".[] | select(.body | contains(\"${MARKER}\")) | {id, body}"
```

If no match: hard-fail with `Finding ${ID} not found in #87 comments`.

**Sweep mode (no argument).** Pull the most recent comment that
actually contains finding markers (the review bot is allowed to post
no-op comments like `YYYY-MM-DD — no-op …` with zero findings; those
must be skipped, not picked), then extract every finding ID from it.
Three pagination / shape subtleties matter:

1. Without `--slurp`, `gh api --paginate --jq '... | last'` runs the
   filter once per page and returns one row per page (last-of-each-
   page, not the global latest comment).
2. With `--slurp`, `gh api` returns an array of pages (one entry per
   page) rather than a flat list of comments, so `sort_by(.created_at)`
   would be operating on an array-of-arrays. Pipe through `add` first
   to concatenate the pages into a single flat array.
3. The newest comment may be a no-op summary with no findings. Filter
   to comments whose body contains `<!-- f:` _before_ taking `last`,
   so sweep mode picks the most recent comment that has work to do.
4. When `last` is applied to an empty array it returns `null`, but a
   bare `| {id, body}` projection turns that into the misleading
   `{"id":null,"body":null}` — i.e. truthy JSON. Guard the projection
   with `if . == null then empty else {id, body} end` so an
   "everything is no-op" run yields a genuinely empty `LAST_COMMENT`.
5. Finding-marker text can legitimately appear inside a finding's
   `<details>` body or diff block (the bot quotes other comments).
   Parse IDs only from checklist lines (`- [ ]` / `- [x]`) so quoted
   marker templates inside bodies are not mistaken for real findings.

```bash
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
LAST_COMMENT="$(gh api "repos/${REPO}/issues/87/comments" \
  --paginate --slurp \
  --jq 'add
        | map(select(.body | contains("<!-- f:")))
        | sort_by(.created_at)
        | last
        | if . == null then empty else {id, body} end')"

if [ -z "${LAST_COMMENT}" ] || [ "${LAST_COMMENT}" = "null" ]; then
  echo "No comment on #87 contains findings — nothing to sweep" >&2
  exit 1
fi

echo "${LAST_COMMENT}" | jq -r '.body' \
  | grep -E '^- \[[ x]\] ' \
  | grep -oE '<!-- f:[A-Za-z0-9]+\.[0-9]+ -->' \
  | sed -E 's/<!-- f:(.+) -->/\1/'
```

For each ID returned:

- Skip if its checklist line in the same comment body starts with
  `- [x]` (already shipped — log `Skipping <id> (shipped in #N)` and
  continue).
- Skip if `.worktrees/fix-review-<slug>` already exists (log
  `Skipping <id> (worktree exists at <path>)` and continue).
- Otherwise, run steps 2 → 5 for that finding.

### 2. Extract finding fields

From the matched comment body, locate the line ending with
`<!-- f:<sha7>.<idx> -->`. Pull:

- **Severity** — the `**[…]**` token (`BLOCKER` / `MAJOR` / `MINOR` /
  `NIT`).
- **Path** — the backtick-quoted path immediately after.
- **Title** — the text between `— ` and the HTML comment.
- **Body** — the contents of the `<details>` block on the lines below.

If the line shows `- [x]` instead of `- [ ]`: hard-fail
`Finding <id> already shipped in #<PR>`.

### 3. Compute slug + paths

```text
slug          = kebab(severity-lowercased + first 4 words of title), trim ≤ 50 chars
worktree-dir  = .worktrees/fix-review-<slug>
branch        = fix/review-bot-<slug>
plan-path     = docs/plans/YYYY-MM-DD-review-bot-<slug>.md   (UTC date)
```

Example for `682b557.1` (`[BLOCKER]` `LlmProviderPort.ts` interface→type sweep):

```text
slug          = blocker-llmproviderport-interface-to-type
worktree-dir  = .worktrees/fix-review-blocker-llmproviderport-interface-to-type
branch        = fix/review-bot-blocker-llmproviderport-interface-to-type
plan-path     = docs/plans/2026-04-25-review-bot-blocker-llmproviderport-interface-to-type.md
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
