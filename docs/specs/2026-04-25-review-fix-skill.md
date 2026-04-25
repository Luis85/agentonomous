---
date: 2026-04-25
slug: review-fix-skill
status: approved
related-issue: '#87'
---

# `review-fix` skill — ingest daily-review findings into PRs

## Problem

The daily code-review routine (`docs/review-bot/`) appends findings to a
rolling tracker issue (`#87 Daily code review — develop`) once per
weekday. Each comment lists `[BLOCKER] / [MAJOR] / [MINOR] / [NIT]`
findings against `develop`. Today there is no ergonomic, reproducible
workflow to:

1. Pick a finding from the tracker.
2. Turn it into a worktree-isolated topic branch + implementation plan.
3. Open a PR that links the finding without closing the tracker issue
   (the tracker is long-lived; the daily run keeps appending).
4. Mark the finding as shipped on the tracker comment after the PR
   merges, so progress is visible in-place rather than via a separate
   spreadsheet.

Manual handling drifts: people fix the loud blockers, forget the
minors, and the tracker becomes an append-only graveyard with no
shipped/unshipped distinction.

## Goals

- One canonical ID per finding, computable by the bot at write time
  (no post-write rewrite step).
- Skill that takes a finding ID and produces a topic branch +
  worktree + plan + PR, ready for `executing-plans`.
- Automatic checkbox flip on the tracker comment when the PR merges.
- Tracker issue stays **open** — no PR closes or auto-closes it.
- Daily-review docs (`docs/daily-reviews/YYYY-MM-DD.md`) remain
  immutable snapshots; only the rolling issue's comments mutate.

## Non-goals

- Auto-implementing the fix. Skill stops after the plan is written;
  the user (or a separate executing-plans session) does the code.
- Bundling multiple findings into one PR. One finding = one PR (matches
  the existing "never stack branches" rule in `feedback_pr_hygiene.md`).
- Replacing the daily-review routine itself; this consumes its output.
- Per-finding state machine beyond `unshipped` / `shipped`. No
  `in-review` / `blocked` states — the PR's own status carries that.

## Design

### Finding ID

Format: `<head-sha[:7]>.<idx>`.

- `head-sha[:7]` — first seven chars of the head SHA the bot reviewed.
  Already present in the per-run footer (`Last reviewed SHA:`).
- `idx` — 1-based position of the finding within that run's output.
  Stable: the bot writes findings in priority order (severity, then
  source order) and never re-orders post-write.

Example: `682b557.3` = third finding of the run that ended at HEAD
`682b557…`.

The ID is embedded as an HTML comment so it does not render:

```markdown
- [ ] **[BLOCKER]** `src/ports/LlmProviderPort.ts` — interface→type sweep <!-- f:682b557.3 -->
```

### Bot output format change (`docs/review-bot/PROMPT.md`)

Each finding is rendered as a checklist item with marker + collapsible
details. Concrete shape:

```markdown
- [ ] **[BLOCKER]** `path/to/file.ts:42` — short title <!-- f:<sha7>.<idx> -->
  <details><summary>details</summary>

  **Problem:** ...

  **Why it matters:** ...

  **Fix:**

  ```diff
  - bad
  + good
  ```

  </details>
```

Both sinks (rolling issue comment and `docs/daily-reviews/<date>.md`)
emit the same format. The daily doc is immutable history; only the
rolling issue's comment is a flip target.

The current `Output format` block in `PROMPT.md` is replaced. The
`Persistence` block is updated so the per-run header (date, range,
counts) precedes the checklist instead of free-form findings.

The "Counter-argument check" line stays in the footer; it operates on
findings before they are written, so it does not need an ID.

### Skill: `.claude/skills/review-fix/SKILL.md`

One mode, one argument: `pick <finding-id>`.

Steps the skill performs:

1. **Locate.** `gh api /repos/{owner}/{repo}/issues/87/comments` →
   stream comments, find the one containing `<!-- f:<id> -->`.
   Fail-fast if missing or already shipped (`- [x]`).
2. **Extract.** Parse the checklist line + the `<details>` block
   beneath it. Pull severity, file path, title, body markdown.
3. **Slug.** `kebab(severity + first-4-words-of-title)`, trimmed to
   ≤ 50 chars. Example: `blocker-llmproviderport-interface-to-type`.
4. **Worktree + branch.** `git worktree add
   .worktrees/fix-review-<slug> -b fix/review-bot-<slug>
   origin/develop`. Run `npm install` inside.
5. **Plan.** Write `docs/plans/2026-04-25-review-bot-<slug>.md` with:
   - Frontmatter (`date`, `slug`, `finding-id`, `tracker: '#87'`).
     The `tracker` value MUST be quoted — `#` opens a YAML comment
     and would otherwise drop the issue reference silently.
   - The finding body verbatim, quoted.
   - Acceptance criteria mirroring the bot's proposed fix (apply +
     tests + `npm run verify` green).
   - Rollout: PR to `develop`, body line `Refs #87 finding:<id>`,
     no `Closes` / `Fixes` keyword.
6. **Hand off.** The skill prints a single-line instruction:
   "Plan written to `<path>`. Run `/superpowers:writing-plans <path>`
   to expand into chunked tasks." The skill itself does **not**
   invoke `writing-plans`; the user runs it explicitly so they can
   review the plan first. Implementation then runs in a separate
   `superpowers:executing-plans` session, by project convention.

The skill does **not** open the PR. PR creation happens at the end of
the implementation session, not at plan time, since plans can be
revised before code lands.

### PR body convention

Implementation sessions end with a PR whose body contains, on its own
line:

```
Refs #87 finding:<sha7>.<idx>
```

This line is what the GitHub Action keys off. It is the only contract
between the skill output and the merge-time flip.

The PR body MUST NOT contain `Closes #87`, `Fixes #87`, or any other
GitHub auto-close keyword targeting the tracker. The PR may close
unrelated issues (e.g. a regression issue filed separately) using
those keywords; only the tracker is protected.

### GitHub Action: `.github/workflows/review-fix-shipped.yml`

Trigger:

```yaml
on:
  pull_request:
    types: [closed]
```

Job runs only when `github.event.pull_request.merged == true`.

Steps:

1. Read PR body. Match `/^Refs #(\d+) finding:([0-9a-f]{7})\.(\d+)\s*$/m`.
   Trailing whitespace is tolerated; trailing punctuation is not — PR
   authors must keep the marker line clean. Loop over all matches (a
   single PR may, in rare cases, ship two findings).
2. For each match:
   - `gh api /repos/{owner}/{repo}/issues/comments` paginated until a
     comment containing `<!-- f:<sha7>.<idx> -->` is found.
   - In that comment body, locate the unique line ending with
     `<!-- f:<sha7>.<idx> -->`.
   - Replace `- [ ]` with `- [x]` on that line and append
     ` (shipped in #<PR>)` immediately before the HTML comment.
   - PATCH the comment with the new body.
3. If no matches: exit 0, log a single-line warning. Do not fail the
   merge.
4. If a match cannot be located (comment not found / line not found /
   already shipped): log warning, exit 0. Idempotent re-runs are
   safe.

Permissions: `issues: write`, `pull-requests: read`. Token: default
`GITHUB_TOKEN`. No PAT needed — the tracker issue lives in the same
repo.

The action runs in its own workflow file so its failures cannot block
unrelated CI. It does not block merges; it observes them.

### One-time migration

The current `#87` comment authored on 2026-04-25 by the bot pre-dates
this format. Two findings exist:

- `[BLOCKER]` `interface` → `type` sweep across 16 declarations.
- `[MINOR]` `MockLlmProvider.pickScript` eager validation.

Migration: a single `gh api -X PATCH` call rewrites that comment body
to the new checklist format with synthetic IDs `682b557.1` and
`682b557.2`. Performed manually as part of the PR that lands this
spec; not part of the skill itself.

Older `no-op (head still <sha>)` comments need no migration — they
have no findings.

### README addition (`docs/review-bot/README.md`)

A new section, "Ingesting findings via `review-fix`", added after
"Output sinks":

- Explains the finding-ID format.
- Points at `.claude/skills/review-fix/SKILL.md`.
- Documents the magic `Refs #87 finding:<id>` PR-body line.
- Documents the auto-flip workflow.

The `Initial setup checklist` gets one new entry: enable the
`review-fix-shipped` workflow (no extra setup beyond the workflow
file existing on `develop`).

## Component boundaries

| Unit | Responsibility | Inputs | Outputs |
|------|---------------|--------|---------|
| Bot prompt | Emit findings with stable IDs | diff, last-SHA | issue comment + daily doc, both with markers |
| `review-fix` skill | Turn one finding ID into a worktree + plan | finding ID | worktree path, plan file, branch ready for impl |
| `writing-plans` (existing) | Expand plan into tasks | spec/plan markdown | task list |
| Implementation session | Apply fix + verify + open PR | plan, branch | PR with magic body line |
| `review-fix-shipped` action | Flip tracker checkbox on merge | merged PR | PATCHed tracker comment |

Each unit is independently testable: the skill against fixture
comments, the action against fixture PR bodies, the bot prompt
against a sample diff.

## Error handling

| Case | Behavior |
|------|----------|
| Skill: ID not found in any comment | Hard error, suggest `gh issue view 87 --comments` to verify ID |
| Skill: comment found but already `[x]` | Hard error: "finding already shipped in #N" |
| Skill: worktree already exists | Hard error, point at existing path |
| Action: PR body lacks magic line | Soft no-op, log warning |
| Action: comment fetched but line missing | Soft no-op, log warning, exit 0 |
| Action: PATCH 4xx (rate limit, perm) | Action exits non-zero — surfaces in Actions UI; merge already done |
| Bot: head-SHA collides with prior run (rebase reset) | Possible in theory; mitigated by index. If a true collision happens, manual re-tag |

## Testing

- **Skill:** unit-level — feed fixture comment markdown, assert
  extracted finding fields, slug, plan content. The git/`gh` calls
  are described but not exercised in this repo's test runner; manual
  smoke once on the live tracker.
- **Action:** snapshot-test the body-rewrite step against a fixture
  comment + fixture PR body. Live integration test = first PR that
  ships a finding.
- **Bot prompt:** no automated test (it's a prompt). Manual: run the
  bot once on a small diff after the prompt change, eyeball both
  sinks for correct IDs and checklist format.

## Risks

- **Bot index drift across reruns.** If the bot's "Counter-argument
  check" drops a finding mid-run, the indices of subsequent findings
  shift. Mitigation: bot computes IDs only after counter-arg pruning,
  immediately before writing the comment — locked at write time.
- **IDs do not de-duplicate across runs.** The same unfixed finding
  re-emitted in tomorrow's run gets a new ID (different `head-sha`).
  This is intentional: each run's IDs reference that run's snapshot.
  The unshipped checkbox on the prior comment still flips when the
  eventual PR ships; future maintainers should not try to reconcile
  IDs across runs.
- **Comment rewrite race.** Bot writes a fresh comment same day the
  Action tries to flip a prior one. Different comments → no race in
  practice; both go through the GitHub API serially.
- **Finding split into multiple files post-fix.** A `[BLOCKER]` that
  the user splits across two PRs cannot easily flip the same checkbox
  twice. Mitigation: don't split. If you must, the second PR's flip is
  a no-op (already `[x]`); add a manual edit to record the second PR
  reference if it matters.
- **Auto-flip touches an issue comment authored by another user.**
  GitHub allows it via API for repo collaborators. Edit history is
  preserved. Acceptable.

## Out of scope (future work, not blocking)

- Severity-filtered batch ingest (e.g. "give me a worktree per
  unshipped BLOCKER").
- Stats panel / dashboard summarising shipped vs unshipped per
  severity.
- Cross-issue rollover when `#87` is rotated at 500 comments — the
  Action will need to learn the active tracker issue number, probably
  via a label query.

## Acceptance for this spec landing

- [ ] Bot prompt + README updated.
- [ ] `review-fix` skill file present, documented, lints clean.
- [ ] `.github/workflows/review-fix-shipped.yml` present and
      `actionlint`-clean.
- [ ] Existing `#87` comment migrated to new format. Visually
      verified post-PATCH that the markers (`<!-- f:682b557.1 -->`
      etc.) do not render and the checklist items render as
      checkboxes.
- [ ] Implementation plan exists at
      `docs/plans/2026-04-25-review-fix-skill.md`.
- [ ] No `Closes #87` / `Fixes #87` anywhere in this PR's body.
