---
'agentonomous': patch
---

Fix: `pickDefaultSnapshotStore()` no longer crashes when
`globalThis.localStorage` is a throwing getter (e.g. sandboxed
third-party iframes blocked by `SecurityError`, or strict
private-browsing modes).

The feature probe now wraps the property access in `try` / `catch`
and falls back to `InMemorySnapshotStore` on any thrown access —
matching the existing construction-time fallback for denied storage
quotas. Consumers in those environments previously saw an
uncaught exception before store selection could finish; now they get
an in-memory store that "just works".
