# `review-fix` Skill Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a `review-fix` skill, a paired GitHub Action, and updated daily-review-bot prompt/README so findings on tracker issue `#87` get stable IDs, can be picked into worktree-isolated topic branches, and are auto-marked shipped on PR merge — without ever closing the rolling tracker.

**Architecture:** Three independent units sharing one contract (the line `Refs #87 finding:<sha7>.<idx>` in PR bodies):

1. **Bot prompt** emits findings as `- [ ] **[SEV]** \`path\` — title <!-- f:<sha7>.<idx> -->` checklist items in both sinks (rolling issue comment + immutable daily doc).
2. **`review-fix` skill** (`.claude/skills/review-fix/SKILL.md`) takes a finding ID, locates the comment via `gh api`, creates a worktree + topic branch + plan file, then prints a hand-off instruction pointing at `superpowers:writing-plans`.
3. **`review-fix-shipped` GitHub Action** triggers on `pull_request: closed && merged`, regexes the PR body for the magic line, and PATCHes the tracker comment to flip `[ ]` → `[x] (shipped in #PR)`. Issue stays open.

A one-time `gh api` PATCH retrofits the existing `#87` comment to the new format.

**Tech Stack:** Markdown (prompt, skill, README, plan), YAML (GitHub Actions workflow), Node-free shell + `gh` CLI for the migration. No library code touched.

---

## Chunk 1: Bot prompt + README

### Task 1: Update bot prompt output format + persistence sink

**Files:**
- Modify: `docs/review-bot/PROMPT.md` (Output format section ~line 102, Persistence section ~line 130)

- [ ] **Step 1.1: Read current prompt sections**

Run:
```bash
sed -n '100,170p' docs/review-bot/PROMPT.md
```

Confirm the `# Output format` and `# Persistence (dual sink)` sections are present and untouched since spec was written.

- [ ] **Step 1.2: Replace Output format section**

In `docs/review-bot/PROMPT.md`, replace the existing `# Output format` section (the per-finding template + counts footer) with this verbatim block:

````markdown
# Output format

Compute a stable ID per finding before writing: `<head-sha[:7]>.<idx>`,
where `idx` is 1-based within this run, assigned **after** counter-arg
pruning, in the priority order findings are written.

Per finding (Markdown checklist item with embedded ID marker):

```markdown
- [ ] **[SEVERITY]** `path/to/file.ts:42` — short title <!-- f:<sha7>.<idx> -->
  <details><summary>details</summary>

  **Problem:** <one line>

  **Why it matters:** <one line, concrete failure mode>

  **Fix:**

  ```diff
  - bad
  + good
  ```

  </details>
```

Rules:
- The HTML comment marker `<!-- f:... -->` MUST be the last token on
  the checklist line. Renderers hide it; the `review-fix-shipped`
  Action keys off it.
- Severity in bold + brackets: `**[BLOCKER]**`, `**[MAJOR]**`,
  `**[MINOR]**`, `**[NIT]**`.
- The short title is the first line of the original `Problem:`,
  trimmed to ≤ 80 chars, no trailing period.

End the comment with the run footer:

- Reviewed range: `<last-sha>..<head-sha>` (`<N>` commits, `<M>` files)
- Blockers: N
- Majors: N
- Minors: N
- Nits: N
- Counter-argument check: `<which finding tested, kept or dropped>`
- Not reviewed: `<areas>`
- Last reviewed SHA: `<head-sha>` ← persist for next run
````

- [ ] **Step 1.3: Update Persistence sink to use the checklist format**

In `docs/review-bot/PROMPT.md`, replace the body example inside `## Sink 1: GitHub issue (rolling log)` with:

```markdown
- Append today's findings as a new comment, format:

  ```
  ## YYYY-MM-DD — <head-sha>
  Reviewed: <last-sha>..<head-sha> (<N> commits)
  Blockers: N | Majors: N | Minors: N | Nits: N

  <checklist of findings, see Output format>

  <run footer>
  ```
```

Inside `## Sink 2: Daily review doc (committed)`, the body block is the same checklist + footer (no change to frontmatter). Add one explicit sentence after the frontmatter description:

> The daily doc is an immutable snapshot of that run; the
> `review-fix-shipped` Action edits the rolling issue comment only,
> never the daily doc.

- [ ] **Step 1.4: Visual diff check**

Run:
```bash
git diff docs/review-bot/PROMPT.md
```

Confirm only the Output format and Persistence sections changed; nothing in `# Role`, `# Scope this run`, `# Priorities`, `# Repo invariants`, `# Process gates`, `# Rules` was touched.

- [ ] **Step 1.5: Commit**

```bash
git add docs/review-bot/PROMPT.md
git commit -m "docs(review-bot): emit findings as checklist items with stable IDs

Each finding now renders as a Markdown task-list item with an
embedded <!-- f:<sha7>.<idx> --> marker. The marker is what the
review-fix-shipped Action keys off to flip [ ] -> [x] when the
fixing PR merges. Both sinks (rolling issue comment, daily doc)
emit the same shape.

Refs #87"
```

---

### Task 2: Update review-bot README with ingestion docs

**Files:**
- Modify: `docs/review-bot/README.md` (insert "Ingesting findings" section + new setup-checklist row)

- [ ] **Step 2.1: Add "Ingesting findings via review-fix" section**

In `docs/review-bot/README.md`, immediately after the `## Output sinks` section and before `## CI behavior on the daily PR`, insert:

````markdown
## Ingesting findings via `review-fix`

The `.claude/skills/review-fix/SKILL.md` skill turns one finding into
a worktree-isolated topic branch + plan, ready for
`superpowers:writing-plans` → `superpowers:executing-plans`.

### Finding ID

Each finding the bot writes carries a stable ID
`<head-sha[:7]>.<idx>`, embedded as an HTML comment on its checklist
line. `head-sha[:7]` is the seven-char prefix of the head SHA
reviewed in that run; `idx` is the 1-based position of the finding
within the run.

IDs do not deduplicate across reruns: tomorrow's run on a new SHA
emits a fresh set of IDs even for findings that were already
unshipped. The unshipped checkbox on the prior comment still flips
when the eventual PR ships.

### Workflow

```text
gh issue view 87 --comments       # find a finding ID
/review-fix pick <id>             # creates worktree + plan
/superpowers:writing-plans <plan> # expand plan into chunked tasks
/superpowers:executing-plans …    # implement, verify, open PR
```

The PR body MUST contain, on its own line:

```
Refs #87 finding:<sha7>.<idx>
```

Trailing whitespace is tolerated; trailing punctuation breaks the
match. The PR body MUST NOT contain `Closes #87` / `Fixes #87` —
the tracker is long-lived and stays open.

### Auto-flip on merge

`.github/workflows/review-fix-shipped.yml` triggers on
`pull_request: closed && merged`, regexes the PR body for the magic
line, locates the matching tracker comment, and edits the body so
the checklist item becomes:

```markdown
- [x] **[BLOCKER]** `path/to/file.ts:42` — short title (shipped in #N) <!-- f:<sha7>.<idx> -->
```

The Action does not block merges; it observes them. If the magic
line is missing, it logs and exits 0.
````

- [ ] **Step 2.2: Add setup-checklist row for the new workflow**

In the `## Initial setup checklist (one-time)` section of the same file, append a new bullet at the end of the list:

```markdown
- [ ] Confirm the `review-fix-shipped` workflow file is present on
      `develop` (`.github/workflows/review-fix-shipped.yml`). It needs
      no extra setup; the default `GITHUB_TOKEN` has the required
      `issues:write` scope.
```

- [ ] **Step 2.3: Visual diff check**

Run:
```bash
git diff docs/review-bot/README.md
```

Confirm only the two insertions above; no other edits.

- [ ] **Step 2.4: Commit**

```bash
git add docs/review-bot/README.md
git commit -m "docs(review-bot): document review-fix ingestion + auto-flip

Adds an 'Ingesting findings' section explaining the finding-ID
format, the magic 'Refs #87 finding:<id>' PR-body line, and the
auto-flip workflow. Also adds the new setup-checklist entry for
the review-fix-shipped workflow.

Refs #87"
```

---

## Chunk 2: `review-fix` skill file

### Task 3: Author `.claude/skills/review-fix/SKILL.md`

**Files:**
- Create: `.claude/skills/review-fix/SKILL.md`

This is a static instruction file, not executable code. There is no
test suite for skill markdown beyond visual review and a smoke run.
The plan-reviewer treats markdown content as the source of truth.

- [ ] **Step 3.1: Verify the skills directory layout matches existing precedents**

Run:
```bash
ls .claude/skills/
```

Expected: directories `new-changeset`, `scaffold-agent-skill`, `verify` (each containing a `SKILL.md`).

If the layout differs, stop and reconcile before continuing.

- [ ] **Step 3.2: Create the skill directory and file**

Run:
```bash
mkdir -p .claude/skills/review-fix
```

Then write `.claude/skills/review-fix/SKILL.md` with this content
verbatim:

````markdown
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

```bash
# Stream comments until one matches the marker.
gh api "/repos/{owner}/{repo}/issues/87/comments" --paginate \
  --jq '.[] | select(.body | contains("<!-- f:<sha7>.<idx> -->")) | {id, body}'
```

If no match: hard-fail with `Finding <id> not found in #87 comments`.

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
````

- [ ] **Step 3.3: Visual review of the skill file**

Run:
```bash
sed -n '1,30p' .claude/skills/review-fix/SKILL.md
```

Confirm:
- Frontmatter has `name` and `description` keys only.
- The description starts with "Ingests" and includes trigger phrases.
- The terminology + steps render in order.

- [ ] **Step 3.4: Commit**

```bash
git add .claude/skills/review-fix/SKILL.md
git commit -m "feat(skills): add review-fix skill for tracker findings

Single-mode skill (pick <finding-id>) that locates a finding in
the rolling tracker issue (#87), creates a worktree + topic
branch + plan file, then prints a hand-off instruction pointing
at superpowers:writing-plans. The skill does not open the PR
and does not edit the tracker comment.

Refs #87"
```

---

## Chunk 3: GitHub Action — auto-flip on merge

### Task 4: Add `.github/workflows/review-fix-shipped.yml`

**Files:**
- Create: `.github/workflows/review-fix-shipped.yml`

The Action's body-rewrite logic is the only piece in this plan with
real code. We use `actions/github-script` so the regex + comment
PATCH stays inline (no extra runtime dep). `actionlint` is already
wired into `ci.yml` (line 113), so YAML correctness is enforced.

- [ ] **Step 4.1: Sanity-check the existing workflow neighbour**

Run:
```bash
ls .github/workflows/
```

Confirm `ci.yml` is present (so the trigger model + Node/runner
versions match precedent).

- [ ] **Step 4.2: Write the workflow file**

Create `.github/workflows/review-fix-shipped.yml` with this content
verbatim:

```yaml
name: review-fix-shipped

on:
  pull_request:
    types: [closed]

permissions:
  issues: write
  pull-requests: read

jobs:
  flip-tracker-checkbox:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Flip tracker checkbox(es) for shipped finding(s)
        uses: actions/github-script@v7
        with:
          script: |
            const body = context.payload.pull_request.body || '';
            const re = /^Refs #(\d+) finding:([0-9a-f]{7})\.(\d+)\s*$/gm;
            const matches = [...body.matchAll(re)];

            if (matches.length === 0) {
              core.info('No "Refs #<n> finding:<sha7>.<idx>" line in PR body. Nothing to flip.');
              return;
            }

            const prNumber = context.payload.pull_request.number;

            for (const m of matches) {
              const [, issueStr, sha7, idxStr] = m;
              const issueNumber = Number(issueStr);
              const findingId = `${sha7}.${idxStr}`;
              const marker = `<!-- f:${findingId} -->`;

              core.info(`Looking for ${marker} in #${issueNumber} comments...`);

              const iterator = github.paginate.iterator(
                github.rest.issues.listComments,
                {
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  issue_number: issueNumber,
                  per_page: 100,
                },
              );

              let hit = null;
              for await (const { data: page } of iterator) {
                hit = page.find((c) => c.body && c.body.includes(marker));
                if (hit) break;
              }

              if (!hit) {
                core.warning(`Finding ${findingId} not found in #${issueNumber}. Skipping.`);
                continue;
              }

              const lineRe = new RegExp(
                `^- \\[ \\] (.+?) ${marker.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`,
                'm',
              );
              const lineMatch = hit.body.match(lineRe);

              if (!lineMatch) {
                if (hit.body.includes(`- [x]`) && hit.body.includes(marker)) {
                  core.warning(`Finding ${findingId} already shipped. Skipping.`);
                } else {
                  core.warning(`Marker ${marker} found but checklist line shape unexpected. Skipping.`);
                }
                continue;
              }

              const newLine =
                `- [x] ${lineMatch[1]} (shipped in #${prNumber}) ${marker}`;
              const newBody = hit.body.replace(lineMatch[0], newLine);

              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: hit.id,
                body: newBody,
              });

              core.info(`Flipped finding ${findingId} -> shipped in #${prNumber}.`);
            }
```

- [ ] **Step 4.3: Run actionlint locally**

`actionlint` is what `ci.yml` runs via `reviewdog/action-actionlint`.
Run the binary directly (most contributors have it installed via
their PATH; if not, install with `go install
github.com/rhysd/actionlint/cmd/actionlint@latest`):

```bash
actionlint .github/workflows/review-fix-shipped.yml
```

Expected: no output, exit code 0.

If `actionlint` is unavailable locally, push a temporary commit on
the topic branch and let CI's `actionlint` job report. Do not
proceed past PR until the job is green.

- [ ] **Step 4.4: Commit**

```bash
git add .github/workflows/review-fix-shipped.yml
git commit -m "ci: add review-fix-shipped auto-flip workflow

On merged PRs, regexes the body for 'Refs #<n> finding:<id>' lines
and PATCHes the matching tracker comment so the checklist item
flips from [ ] to [x] with a (shipped in #PR) annotation. Issue
stays open. No-ops cleanly when the marker is missing or the
finding is already shipped.

Refs #87"
```

---

## Chunk 4: One-time tracker comment migration

### Task 5: Retrofit existing `#87` comment to new format

**Files:**
- None in repo. The migration edits a single GitHub comment via the
  `gh` CLI.

The latest comment (authored by the bot on 2026-04-25) carries two
findings. We assign synthetic IDs `682b557.1` (BLOCKER, interface→type)
and `682b557.2` (MINOR, MockLlmProvider eager validation).

This step runs once. It is **part of the PR that lands this plan** so
reviewers can see the before/after on the rendered comment.

- [ ] **Step 5.1: Snapshot the current comment body**

```bash
gh api "/repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/issues/87/comments" \
  --paginate --jq '.[-1] | {id, body}' \
  > /tmp/issue87-last-comment.json
```

Open `/tmp/issue87-last-comment.json` and confirm the body matches the
findings the spec calls out (BLOCKER `interface`/`type`; MINOR
`pickScript`).

- [ ] **Step 5.2: Hand-write the migrated body**

In a scratch file `/tmp/issue87-new-body.md`, paste the original
header (`## YYYY-MM-DD — <head-sha>` + `Reviewed:` + counts), then
rewrite the two findings as checklist items:

```markdown
- [ ] **[BLOCKER]** `src/ports/LlmProviderPort.ts` — interface→type sweep across 16 declarations <!-- f:682b557.1 -->
  <details><summary>details</summary>

  <original BLOCKER body, verbatim, including the "Counter-argument to my own [BLOCKER]" paragraph>

  </details>

- [ ] **[MINOR]** `src/ports/MockLlmProvider.ts:155` — pickScript silently accepts scripts with no match predicate in match-or-error mode <!-- f:682b557.2 -->
  <details><summary>details</summary>

  <original MINOR body, verbatim>

  </details>
```

Then re-append the original footer (Reviewed range / counts /
Counter-argument check / Not reviewed / Last reviewed SHA).

- [ ] **Step 5.3: PATCH the comment**

Extract the comment ID from `/tmp/issue87-last-comment.json` (`.id`
field), then:

```bash
COMMENT_ID=$(jq -r .id /tmp/issue87-last-comment.json)
gh api --method PATCH \
  "/repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/issues/comments/${COMMENT_ID}" \
  --field body=@/tmp/issue87-new-body.md
```

Expected: 200 OK with the new body echoed.

- [ ] **Step 5.4: Visually verify the rendered comment**

Open the issue page in a browser:
```bash
gh issue view 87 --web
```

Confirm:
- Two checkbox items render at the top of the latest comment.
- Severity tags `[BLOCKER]` and `[MINOR]` are bold.
- The HTML markers `<!-- f:682b557.1 -->` / `<!-- f:682b557.2 -->`
  do **not** render as visible text.
- Each `<details>` block is collapsible and contains the original
  finding body unchanged.
- The run footer (counts, Last reviewed SHA) is preserved at the
  bottom.

- [ ] **Step 5.5: Record migration in the PR description**

Note in the eventual PR body (under a `## Migration` section): which
comment ID was edited, and the synthetic IDs assigned. Reviewers can
diff against the snapshot at `/tmp/issue87-last-comment.json` if they
want to verify nothing was dropped.

This step has no commit (the change is on GitHub, not in the repo).

---

## Chunk 5: Verify and open PR

### Task 6: Pre-PR gate + open PR

**Files:**
- None new — runs the standard verify pipeline.

- [ ] **Step 6.1: Confirm clean working tree**

```bash
git status
```

Expected: nothing to commit, working tree clean. The four commits
on the branch are:
1. `docs(review-bot): emit findings as checklist items with stable IDs`
2. `docs(review-bot): document review-fix ingestion + auto-flip`
3. `feat(skills): add review-fix skill for tracker findings`
4. `ci: add review-fix-shipped auto-flip workflow`

(Plus the two earlier spec commits already on the branch.)

- [ ] **Step 6.2: Run the pre-PR gate**

```bash
npm run verify
```

This runs `format:check && lint && typecheck && test && build`. None
of the changes in this plan touch `src/`, `tests/`, or `examples/`,
so all stages should be no-op fast. If any stage fails on an
unrelated change inherited from `develop`, surface it — do **not**
band-aid with `--no-verify`.

Expected: green across all five stages.

- [ ] **Step 6.3: Push the branch**

```bash
git push -u origin feat/review-fix-skill
```

- [ ] **Step 6.4: Open the PR**

```bash
gh pr create --base develop \
  --title "feat: review-fix skill + auto-flip workflow" \
  --body "$(cat <<'EOF'
## Summary
- New `.claude/skills/review-fix/SKILL.md` skill: turns one tracker finding into a worktree-isolated topic branch + plan, then hands off to `superpowers:writing-plans`.
- New `.github/workflows/review-fix-shipped.yml` workflow: on merged PRs, regexes the body for `Refs #<n> finding:<sha7>.<idx>` and flips the matching tracker checkbox to `[x] (shipped in #PR)`. Issue stays open.
- Updated `docs/review-bot/PROMPT.md` so each finding emits as a Markdown checklist item with embedded `<!-- f:<sha7>.<idx> -->` ID marker. Both sinks share the format; only the rolling issue comment gets flipped.
- Updated `docs/review-bot/README.md` with an "Ingesting findings" section and a setup-checklist row.
- One-time migration of issue #87's latest comment to the new format (synthetic IDs `682b557.1`, `682b557.2`).

## Migration
- Edited comment ID: \`<COMMENT_ID>\` on issue #87.
- Synthetic IDs assigned: `682b557.1` (BLOCKER, interface→type sweep), `682b557.2` (MINOR, MockLlmProvider eager validation).
- Pre-edit snapshot kept at \`/tmp/issue87-last-comment.json\` on the author's machine; reviewers can request it for diffing.

## Test plan
- [ ] `npm run verify` green (doc-only diff outside `.github/` so most stages are no-ops; `actionlint` enforces the workflow YAML).
- [ ] Skill smoke test: `gh issue view 87 --comments` resolves a finding ID; running the skill creates the worktree + plan without errors.
- [ ] Action dry-run: a follow-up PR that fixes finding `682b557.2` triggers the workflow on merge and flips the checkbox in #87.
- [ ] Visual check on the migrated comment: checklists render, markers hidden, details collapsible.

Refs #87
EOF
)"
```

**Critical:** the PR body contains `Refs #87` (intentional, for cross-linking) and **does not** contain `Closes #87` or `Fixes #87`. The tracker stays open.

- [ ] **Step 6.5: Wait for Codex review**

Per project memory `feedback_pr_workflow.md`, leave the PR for Codex
to comment, then sweep its threads. Address each before the owner
merges.

- [ ] **Step 6.6: Post-merge cleanup**

After the owner merges:

```bash
git switch develop
git pull origin develop
git worktree remove .worktrees/feat-review-fix-skill
git branch -d feat/review-fix-skill
git fetch --prune origin
```

This step has no commit; it just resets local state per CLAUDE.md.

---

## Smoke test (post-merge, optional but recommended)

After this PR lands, validate the full loop end-to-end on the lowest-risk
finding (`682b557.2`, MINOR `MockLlmProvider` eager validation):

1. From a fresh shell on `develop`: `/review-fix pick 682b557.2` →
   confirm worktree + plan appear.
2. Run `/superpowers:writing-plans` on the new plan.
3. Implement + verify + open the fix PR with body containing
   `Refs #87 finding:682b557.2`.
4. Owner merges.
5. Within a minute, the `review-fix-shipped` Action job appears under
   "Checks" → "review-fix-shipped" with status success.
6. Reload issue #87 — the MINOR checkbox now shows `- [x] ... (shipped in #<N>)`.

If any of those six steps fails, file the failure mode against this
plan. The skill + workflow are not "shipped" until the smoke test
goes green.
