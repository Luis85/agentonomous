---
'agentonomous': minor
---

Remove unused `pendingEvents` field from `AgentSnapshot`.

The field was declared on the public interface but never populated by
`Agent.snapshot()` nor read by `Agent.restore()` — a dead promise in the
public type. Consumers cannot have been relying on it, but the type-level
shape narrows, so this is shipped as a minor bump. Wire format is
byte-identical: because the field was optional and never written,
`JSON.stringify(snapshot)` already omitted the key.

If event-queue persistence is genuinely wanted later, re-introduce with a
real implementation rather than restoring the dead declaration.
