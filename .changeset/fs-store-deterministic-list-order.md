---
'agentonomous': patch
---

Fix: `FsSnapshotStore.list()` now returns keys in deterministic
`localeCompare` order.

Previously the method returned whatever order the underlying
`readdir(path)` handed back — ext4 hash order, NTFS MFT order, tmpfs
insertion order, etc. — so a Linux CI run and a Windows developer
machine could see different results from the same snapshot directory.

The store now sorts the decoded key list before returning. Consumers
get reproducible output across platforms; determinism-sensitive
callers (snapshot replay, trace comparisons) no longer need to sort
themselves.
