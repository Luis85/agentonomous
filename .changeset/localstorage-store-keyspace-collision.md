---
'agentonomous': minor
---

Fix: `LocalStorageSnapshotStore` no longer lets a user-supplied key collide
with its own index metadata.

Previously both snapshot payloads and the index list were stored under
`{prefix}{key}`, so saving under `key === '__agentonomous/index__'`
silently overwrote the index — `list()` then returned garbage and the
snapshot became unreachable.

The store now splits the keyspace into disjoint sub-namespaces:

- `{prefix}__agentonomous/data/{encodeURIComponent(userKey)}` — payloads.
- `{prefix}__agentonomous/meta/index` — the O(1) key list.

User-supplied keys are `encodeURIComponent`-encoded before the storage
write, so strings that look like meta paths can never escape the data
subspace. The index payload still contains raw (decoded) user keys — no
consumer-visible shape change.

Existing entries written under the pre-split layout are migrated once on
construction: legacy `{prefix}{userKey}` payloads are rewritten under the
new data path, and the legacy `{prefix}__agentonomous/index__` entry is
rewritten under the new meta path. No consumer action required.

Public `StorageLike` interface is unchanged. Migration uses a runtime
capability probe for iteration (`length` + `key(index)`); backends that
don't expose iteration skip migration silently — in-memory stubs
typically have no legacy data anyway.
