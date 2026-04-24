---
'agentonomous': patch
---

Fix: `FsSnapshotStore.list()` now returns keys in deterministic
Unicode code-point order.

Previously the method returned whatever order the underlying
`readdir(path)` handed back — ext4 hash order, NTFS MFT order, tmpfs
insertion order, etc. — so a Linux CI run and a Windows developer
machine could see different results from the same snapshot directory.

The store now sorts the decoded key list with a locale-independent
code-point comparison before returning. `localeCompare` would
re-introduce cross-host divergence for non-ASCII keys (different
`LANG` / ICU locales order them differently), so the store uses raw
code-point order to stay stable regardless of process locale.
Determinism-sensitive callers (snapshot replay, trace comparisons) no
longer need to sort themselves.
