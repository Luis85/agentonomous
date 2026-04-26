---
'agentonomous': patch
---

Fix `TfjsReasoner.toInputTensor` so a `number[][]` (or `TypedArray[]`)
returned by `featuresOf` keeps its intended rank-2 shape `[B, N]`
instead of being wrapped to a rank-3 `[1, B, N]`. Previously every
array-like input picked up an extra leading axis, so consumers wiring
batch features hit `Error when checking : expected dense_X_input to
have 2 dimension(s), but got array with shape [1,B,N]` from
`model.predict`. The 1-D `number[]` and single `TypedArray` paths still
wrap to `[1, N]` (unchanged contract — matches the JSDoc that already
documented batch input as supported).
