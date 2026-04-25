---
'agentonomous': patch
---

Reject invalid inputs in three persistence helpers (review findings from
PR #105):

- `migrateSnapshot()` now throws `SnapshotRestoreError` when
  `schemaVersion` is `NaN`, `±Infinity`, fractional, or negative instead
  of silently treating non-integer numbers as a valid version.
- `AutoSaveTracker.shouldSave()` treats negative, zero, `NaN`, and
  `±Infinity` values for `everyTicks` / `everyVirtualSeconds` as
  disabled, preventing the autosave hot-loop that previously fired on
  every tick when a misconfigured negative threshold slipped through.
- `runCatchUp()` throws `RangeError` for non-positive or non-finite
  `chunkVirtualSeconds` and for non-positive / non-integer `maxChunks`
  instead of returning misleading `truncated: true` summaries with no
  forward progress.
