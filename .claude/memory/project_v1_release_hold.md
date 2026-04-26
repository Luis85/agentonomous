---
name: 1.0 release on hold
description: Major-bump changesets accumulate but no npm publish until further library + demo polish is done. Ship breaking changes, don't ship 1.0 itself.
type: project
---

The 1.0.0 npm publish is deliberately **held** while the library and
demo get further polished. The 1.0 prep items (rename pass, LLM port,
narrowed surface, JSDoc audit) have landed on `develop` and queued
their major-bump changesets in `.changeset/`. The publish step itself
is paused by maintainer decision.

**Why:** Maintainer wants to keep iterating on library ergonomics and
the demo before the public 1.0 surface freezes. Premature publish
locks in shape decisions that will be cheaper to change pre-publish.

**How to apply:**

- Keep opening PRs that would normally land in the 1.0 train (breaking
  renames, narrowed surface, new ports). They're welcome; the
  changeset metadata pins them to the major bump that ships whenever
  1.0 is eventually cut.
- **Before adding a new major-bump changeset, skim
  `.changeset/*.md`** so you know what's already queued. The pile is
  the source of truth for what 1.0 will break — don't duplicate or
  contradict an existing entry; update the existing one instead.
- Don't run `changeset version` / `changeset publish` until the
  maintainer explicitly asks for the 1.0 cut.
- When opening a major-bump PR, note in the PR body that "1.0 is on
  hold; this PR queues the breaking change for when we publish" so
  reviewers don't assume a release is imminent.
- Prefer polish + demo + vision-forward work over "finalising" the 1.0
  surface until the maintainer signals go.

**Signal the hold is lifted:** maintainer asks for a release / publish
PR, asks to run `changeset version`, or opens an explicit 1.0
milestone.
