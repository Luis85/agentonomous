---
name: review-fix
description: Ingests a single finding from the rolling daily-code-review tracker issue (`#87 Daily code review — develop`) and produces a worktree-isolated topic branch + implementation plan. Use when the user says "fix review finding <id>", "pick a finding", "/review-fix <id>", or names a finding-ID like `682b557.3`. Does NOT close the tracker issue — the tracker is append-only and the auto-flip workflow handles shipped state.
---

# review-fix — turn one tracker finding into a worktree + plan

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

## Before you start

Confirm with the user:

1. **Finding ID** — exact form `<sha7>.<idx>`. If they paste a free-text
   description instead, refuse and ask them to grab the ID from
   `gh issue view 87 --comments`.
2. **Already shipped?** — if the tracker line for that ID renders
   `- [x]`, refuse and tell them which PR shipped it (the comment line
   carries `(shipped in #N)`).
3. **Worktree clear?** — if `.worktrees/fix-review-<slug>` already
   exists, refuse with the existing path. Either remove it
   (`git worktree remove`) or pick a different finding.

## Steps

### 1. Locate the finding

Substitute the user-provided finding ID (e.g. `682b557.3`) for `${ID}`
below before running:

```bash
ID="<sha7>.<idx>"            # e.g. 682b557.3
MARKER="<!-- f:${ID} -->"
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
gh api "/repos/${REPO}/issues/87/comments" --paginate \
  --jq ".[] | select(.body | contains(\"${MARKER}\")) | {id, body}"
```

If no match: hard-fail with `Finding ${ID} not found in #87 comments`.

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

Print exactly:

```text
Plan written to <plan-path> on branch <branch> in <worktree-dir>.
Next: cd <worktree-dir> && /superpowers:writing-plans <plan-path>
```

**Do not** invoke `superpowers:writing-plans` automatically. The user
runs it after reviewing the plan.

## Do not

- Do NOT open the PR. PR creation belongs to the implementation
  session, not the plan session.
- Do NOT close the tracker issue. Do NOT add `Closes #87` / `Fixes #87`
  anywhere.
- Do NOT edit the tracker comment from the skill — only the
  `review-fix-shipped` Action edits comments, and only post-merge.
- Do NOT batch findings. One finding = one branch = one PR.
- Do NOT use `git worktree add -B` (force). Surface conflicts to the
  user.
