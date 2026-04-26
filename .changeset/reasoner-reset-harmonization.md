---
'agentonomous': minor
---

**feat(cognition):** `Reasoner` port now exposes an optional `reset()` hook.
The `Agent` kernel invokes it at two fixed call sites:

- Synchronously after `Agent.setReasoner(next)`, on the **incoming** reasoner.
- At the very end of `Agent.restore(...)`, after the catch-up-tick loop, on the
  **live** reasoner.

`MistreevousReasoner` and `JsSonReasoner` already implement `reset()` — they now
formally satisfy the port contract and carry JSDoc linking to it.
`TfjsReasoner` deliberately opts out: its weights "MUST be preserved" across
resets per the interface contract, so a no-op or a weight-revert would both be
wrong — the kernel's null-safe `reset?.()` call handles the absence cleanly.

No schema changes. No breaking changes. Stateless reasoners may continue to
omit `reset()`.
