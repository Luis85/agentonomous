---
'agentonomous': patch
---

Fix `TfjsReasoner.detectBestBackend` to serialise overlapping callers
behind a single in-flight detection promise. Previously each
invocation mutated global tfjs state via `tf.setBackend` independently,
so two concurrent chains could race — one caller could resolve to
`'wasm'` while the other raced through and left tfjs on `'cpu'`,
breaking the first caller's "returned backend is the active backend"
post-condition. Boot logic + UI initialization commonly trigger this
overlap. Subsequent calls after the in-flight chain settles re-probe
fresh, so consumers can re-detect after installing a new backend
package mid-session.
