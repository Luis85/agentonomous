---
'agentonomous': minor
---

Fix: `LocalStorageSnapshotStore` no longer lets a user-supplied key
collide with its own index metadata.

Previously both snapshot payloads and the index list were stored
under `{prefix}{key}`, so saving under `key === '__agentonomous/index__'`
silently overwrote the index — `list()` then returned garbage and the
snapshot became unreachable.

The store now splits the keyspace into disjoint sub-namespaces:

- `{prefix}__agentonomous/data/{encodeURIComponent(userKey)}` — payloads.
- `{prefix}__agentonomous/meta/index` — the O(1) key list.

`encodeURIComponent`-encoded user keys can never escape the data
subspace, so any string a consumer supplies is safe.

**Storage shape has changed.** This is pre-1.0; no migration path is
provided for stores created by earlier pre-release builds. Consumers
upgrading from a pre-release version should clear their
`__agentonomous/` namespace before loading.

Also adds input validation:

- Empty prefix is rejected at construction — an empty namespace would
  collide with unrelated storage keys.
- Keys that are not well-formed UTF-16 (lone surrogates) produce a
  store-specific error from `save` / `load` / `delete` instead of a
  bare `URIError` from `encodeURIComponent`.
