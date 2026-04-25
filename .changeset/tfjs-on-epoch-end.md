---
'agentonomous': minor
---

Add `onEpochEnd?: (epoch, loss) => void` to `TfjsReasoner.train`'s
`TrainOptions`. Fires synchronously after each `model.fit` epoch with
the 0-indexed epoch number and that epoch's loss — drives progress UIs
("Training… 42/100") or live loss-curve renderers without waiting for
the full fit to resolve. Determinism is preserved (no scheduling
added; callback runs on the same backend + microtask stage as the
fit).
