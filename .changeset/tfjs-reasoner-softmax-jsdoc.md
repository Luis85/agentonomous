---
'agentonomous': minor
---

Document the N-way softmax pattern on `TfjsReasoner` with a fenced
TypeScript example showing how to wire `featuresOf` + `interpret` for
argmax-over-K-skills inference. No source change — the adapter already
supports multi-dim outputs via `dataSync()`-flattened arrays — but the
example is the consumer-facing entry point for the demo's row-17
Learning-mode rewire (7-way softmax over the active-care skills).

Mirrors the post-training one-hot label shape `categoricalCrossentropy`
expects so consumers porting from a scalar-urgency `interpret` see the
intended end-to-end shape (build → compile → train → interpret).
