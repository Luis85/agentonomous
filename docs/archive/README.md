# `docs/archive/` — frozen historical docs

Holding pen for plans, specs, and other prose that has outlived its
active relevance but is worth preserving for context. Moved here when
a doc is **superseded, completed, or intentionally retired** — not
when it's merely stale (stale docs get fixed in place; only docs that
no longer apply get archived).

## What goes here

- Plans whose roadmap rows have all shipped and which no live work
  references.
- Specs for designs that were superseded by a later spec (link forward
  from the archived spec to its successor in the same PR that archives
  it).
- Old "comprehensive plan" / "next session" planning docs once their
  successors take over.
- Any doc the `docs-review-bot` routine flagged as drift-prone +
  stale + the owner agreed should be retired rather than kept current.

## What does NOT go here

- Docs that are merely outdated. Fix them in place.
- Daily review snapshots (`docs/daily-reviews/`) — those are already
  immutable per-day artifacts and have their own folder.
- Generated API docs (`docs/api/`) — regenerated, never archived.
- Changesets (`.changeset/`) — consumed by the changesets tool.

## Conventions

- Preserve the original filename (including its `YYYY-MM-DD-<slug>.md`
  date prefix). Use `git mv` so history follows.
- Prepend a one-line archived banner to the top of the file in the
  same commit:

  ```markdown
  > **Archived YYYY-MM-DD.** Superseded by `<path>` / completed in `#<PR>` / retired (rationale).
  ```

- Do NOT edit the body of an archived doc. Banner only. The body is
  the historical record.
- The `docs-review-bot` routine does NOT review files under this
  folder (see `docs/docs-review-bot/PROMPT.md` exclusions). Drift is
  expected here — that's the point.

## Restoring

If an archived doc becomes relevant again, `git mv` it back to its
original location and remove the banner in the same commit. Don't
copy — move, so the history stays linear.
