---
'agentonomous': patch
---

Fix: `FsSnapshotStore.list()` no longer rejects when the snapshot
directory contains a `.json` filename the encoder wouldn't have produced
(e.g. a foreign file with a literal `%` outside a valid `%XX` sequence).

Previously the call to `decodeURIComponent` via `decodeKey` could throw
`URIError`, propagating out of `list()` and failing the whole call. Now
`list()` catches per-entry decode errors and skips the offending file —
such names can't round-trip through key-based `load()` anyway, so
surfacing them would just hand callers an unusable key.

Follow-up to #57 addressing a reviewer-flagged edge case.
