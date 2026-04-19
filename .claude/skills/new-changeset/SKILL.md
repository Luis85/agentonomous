---
name: new-changeset
description: Creates a changeset under `.changeset/` describing the current PR's semver bump and user-facing summary. Use when the user says "add a changeset", "changeset for this", "record the change", or is preparing a PR that changes library behavior. Picks the right bump level (patch / minor / major) based on the changes staged or described, and writes the file without running the interactive CLI.
---

# new-changeset — record a release entry

Every PR that changes library behavior needs a `.changeset/*.md` file.
Docs-only and pure-refactor PRs can skip it.

This skill writes the file directly, skipping the interactive
`npm run changeset` prompt, since the LLM already knows what changed.

## When to add one

- `feat: …` — **minor** bump (new API surface).
- `fix: …` — **patch** bump (no API change, behavior correction).
- `refactor: …`, `docs: …`, `chore: …`, `test: …`, `build: …`, `ci: …`
  — typically **no changeset**. Skip unless the refactor changes
  observable behavior.
- Breaking API change (removed export, changed signature, bumped peer
  dep range in a breaking way) — **major** bump. Requires a migration
  note in the changeset body.

Pre-1.0 (`0.x.y`), minor bumps signal breaking changes and patch bumps
cover everything else. The repo is currently `0.0.0` pre-release — once
`1.0.0` ships, normal semver resumes.

## File format

Location: `.changeset/<slug>-<noun>.md` where `<slug>` is the branch-ish
two-word identifier the user or you pick (e.g. `proud-owl`,
`groom-skill`). The changesets CLI normally auto-generates the slug; for
manual files, any readable kebab-case name works.

```md
---
'agentonomous': patch
---

One-sentence summary of the user-visible change, written for the
CHANGELOG. Past tense, no period-prefix.

Optional second paragraph with context, migration notes, or linked
issue numbers. Keep it short — detailed rationale belongs in the PR
body, not the changeset.
```

Bump keyword is literally `patch`, `minor`, or `major`. The package name
MUST match `package.json` (`'agentonomous'`).

## How to write a good summary

- Lead with the verb a user cares about: "Add", "Fix", "Change",
  "Remove", "Deprecate".
- Name the symbol they'd search for: `agent.invokeSkill`,
  `AgentSnapshot`, `MedicateSkill`.
- If the change is a fix, name the bug shape, not the commit hash.

**Good:**

```
Fix `agent.restore()` re-emitting `MoodChanged` when the snapshot
already carried a mood state.
```

**Less good:**

```
Bug fix for mood.
```

## Examples

Minor — new skill:

```md
---
'agentonomous': minor
---

Add `GroomSkill` to the default pet interaction bundle. Satisfies the
`cleanliness` need and applies a short `groomed` mood-bias buff.
```

Patch — behavior fix:

```md
---
'agentonomous': patch
---

`ModifiersTicker` now emits `ModifierExpired` exactly once when a
modifier's `expiresAt` equals the current tick time. Previously the
event could fire zero or two times depending on tick alignment.
```

Major — breaking API:

```md
---
'agentonomous': major
---

Rename `AgentSnapshot.mood` to `AgentSnapshot.currentMood` for
consistency with `getState()`. Snapshots serialized with the old key
continue to load via the existing migration.

Migration: no consumer code change needed; the adapter migrates the
stored form transparently. Custom snapshot stores that read the field
directly should update the key.
```

## Do not

- Do NOT create a changeset for `.changeset/` cleanup, CI tweaks, or
  local tooling changes.
- Do NOT combine multiple unrelated semver bumps in one file — one
  changeset per logical change.
- Do NOT reference PR numbers (the CHANGELOG gets those from the merge
  metadata).
- Do NOT use `chore:`-style prefixes in the body — it's a CHANGELOG
  entry, not a commit subject.
- Do NOT commit a changeset on `main` or `develop` directly — it rides
  along with the PR.

## After writing

1. Stage it (`git add .changeset/<slug>-<noun>.md`).
2. Include it in the same commit as the change it describes, OR a
   follow-up commit on the same topic branch before opening the PR.
3. The release workflow consumes and deletes processed changesets — you
   don't clean them up manually.
