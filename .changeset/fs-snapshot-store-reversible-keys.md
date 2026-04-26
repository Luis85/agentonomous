---
'agentonomous': patch
---

Fix: `FsSnapshotStore` now uses reversible percent-encoding for on-disk
filenames, so distinct logical keys always map to distinct files and
`list()` correctly decodes filenames back to the original keys.

Previously the store's internal `sanitizeKey` replaced every non-
`[A-Za-z0-9._-]` character with `_`, so keys like `'user/1'`, `'user_1'`,
and `'user 1'` all collided to the same `user_1.json` — silent data loss
on `save()` and an ambiguous round-trip on `list()`. The new
`encodeKey` / `decodeKey` helpers are exported from the module for
direct unit testing.

**On-disk format break (Node-side consumers).** Snapshots written under
the previous `sanitizeKey` layout cannot be read through the new
encoder. Migrate by listing old files on disk, loading the JSON
directly, and re-saving under the new scheme; or wipe the snapshot
directory if stored state is regenerable. No automated migration is
shipped — pre-1.0, manual handling is acceptable.
