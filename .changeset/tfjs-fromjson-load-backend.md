---
'agentonomous': patch
---

Fix `TfjsReasoner.fromJSON` to side-effect-import the matching
`@tensorflow/tfjs-backend-*` package BEFORE calling `tf.setBackend`.
Previously, `fromJSON({ backend: 'cpu' | 'wasm' | 'webgl' })` rejected
with `TfjsBackendNotRegisteredError` whenever the consumer hadn't
already imported the backend package themselves — even though the
package was installed — because `tf.setBackend` queries the registry
that the backend package's top-level `tf.registerBackend(...)` call
populates. The new flow matches the existing
`loadBackendModule → setBackend` order in `detectBestBackend`.
