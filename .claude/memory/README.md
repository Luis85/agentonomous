# `.claude/memory/`

Shared, in-repo project memory for AI coding assistants (Claude Code,
Codex CLI, Cursor, etc.) and human contributors. Everything here is
checked in so every contributor — human or agent — works from the same
baseline instead of accumulating it ad-hoc per machine.

## What lives here

Two memory categories, mirroring the Claude Code memory taxonomy:

- **`project_*.md`** — facts about ongoing work, release posture,
  external review surface, roadmap pointers. State that lives outside
  the source tree and isn't derivable from `git log`.
- **`feedback_*.md`** — workflow rules and conventions the team has
  converged on through trial and incident. Each one carries a
  **Why:** (the originating reason) and a **How to apply:** (when the
  rule fires).

Anything user-specific (per-machine paths, individual contributor
preferences, local tooling quirks) is intentionally **not** stored here
— that belongs in each contributor's own `~/.claude/` config.

## How to read it

Start with [`MEMORY.md`](./MEMORY.md). It's a one-line-per-entry index
ordered by relevance to day-to-day PR work. Open the linked file when
you need the full reasoning.

For Claude Code specifically: [`CLAUDE.md`](../../CLAUDE.md) at the
repo root points at this directory, so an agent that reads `CLAUDE.md`
will surface these memories automatically.

## How to update it

Treat memory edits like any other change:

- Cut a topic branch off `develop` in a worktree
  (`docs/memory-<slug>` or `chore/memory-<slug>`) — see the
  `Worktrees per topic branch` non-negotiable in
  [`CLAUDE.md`](../../CLAUDE.md).
- Add or edit the `.md` file. Keep frontmatter (`name`, `description`,
  `type`) in sync with the body.
- Add or update the matching one-liner in `MEMORY.md`.
- Open a PR to `develop` like normal. Memory edits are docs-only — no
  changeset required.

When a memory turns out to be wrong or stale, **delete it** rather than
leaving a corrected duplicate. Index entries should never outlive their
target file.

## What does not belong here

- Architecture, file paths, or coding conventions already in
  `CLAUDE.md`, `CONTRIBUTING.md`, `STYLE_GUIDE.md`, or `PUBLISHING.md`.
- Per-PR snapshots that rot quickly (e.g. "which PRs currently carry a
  major-bump changeset" — that's what `.changeset/` is for).
- Debugging recipes or fix-of-the-week notes — fixes live in commits;
  the _why_ lives in the commit message.
- Anything sensitive: secrets, tokens, private URLs, customer names.
