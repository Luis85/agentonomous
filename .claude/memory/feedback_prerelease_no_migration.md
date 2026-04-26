---
name: Pre-1.0 PRs skip legacy-migration / compat layers
description: In pre-1.0 agentonomous PRs, don't ship migration or backward-compat code for prior pre-release shapes — no consumers have them on disk.
type: feedback
---

Pre-1.0, no package version has been npm-published. No consumer has
any prior storage / snapshot / API shape on disk. A PR that changes
storage layout, schema version, or public shape should change it
**directly** — not ship a migration layer or compat shim to "preserve
v1 data".

**Why:** A prior PR shipped a legacy-migration layer to protect
consumers holding a pre-split storage layout. There were none. The
layer kept attracting Codex findings (marker collisions, non-iterable
adapter paths, re-entrance edge cases, partial-write leaks) — many
fixups deep before the call was made to rip it. Removing the entire
migration dropped ~850 lines and ~1.75 KB gzip, produced a cleaner
core fix, and Codex 👍'd immediately.

**How to apply:**

- When a PR changes on-disk shape (`localStorage` layout, snapshot
  schema, file path) before the 1.0 publish, prefer a clean break.
- Document the shape change in the changeset; note that pre-1.0
  consumers of earlier pre-release builds should clear their
  namespace before loading. No migration promised.
- If Codex starts posting findings about migration edge cases, check
  first whether migration is actually needed — "is there a consumer
  holding the old shape on disk right now?" For pre-1.0: no.
- **Post-1.0 is different.** Once published, migrations protect real
  users and are worth the complexity.

**Signals this rule applies:**

- [`project_v1_release_hold.md`](./project_v1_release_hold.md) is
  still active.
- Roadmap track is still "polish/harden pre-1.0".
- No changeset entries describe a prior shipped shape on npm.
