---
'agentonomous': minor
---

Expose `getTimeScale(): number` on `AgentFacade`.

Reactive handlers and modules can now read the current wall-to-virtual
multiplier without reaching past the facade boundary — useful for
deferring work during pause (`facade.getTimeScale() === 0`) or logging
the scale alongside tick-time. The setter stays on `Agent` only;
keeping pause a harness-level concern matches the
`setTimeScale` contract (which is not exposed on the facade).
