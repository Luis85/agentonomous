---
'agentonomous': minor
---

Add `TfjsReasoner.detectBestBackend(): Promise<'webgl' | 'wasm' | 'cpu'>`
and `TfjsReasoner.probeBackend(name): Promise<boolean>` static methods.

`detectBestBackend` walks `webgl → wasm → cpu` and returns the first
that registers + activates without throwing; on resolve, `tf.backend()`
is the value reported. Side-effect-imports the matching
`@tensorflow/tfjs-backend-*` package via lazy dynamic `import()` so
backend packages stay code-split.

`probeBackend` is the inquiry-only single-name probe — restores the
prior backend regardless of outcome so a UI can probe all three in
sequence to populate a picker's disabled-option state without
disturbing the active backend.

JSDoc invariant: GPU backends (`webgl`) are NOT determinism-preserving.
Replay parity (`SeededRng` + `ManualClock` → byte-identical
`DecisionTrace`s) holds only on `cpu`; pass `'cpu'` explicitly to the
constructor for any session whose trace must be reproducible across
machines.

The `@tensorflow/tfjs-backend-cpu`, `@tensorflow/tfjs-backend-wasm`,
and `@tensorflow/tfjs-backend-webgl` packages move to optional peer
dependencies — consumers install only the backend(s) they actually
intend to use.
