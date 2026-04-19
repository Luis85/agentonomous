---
'agentonomous': minor
---

Emit a new `AgentTicked` domain event at the end of every non-halted
tick. Consumers subscribing via `agent.subscribe` now receive a per-tick
signal without polling `getState()` from a `requestAnimationFrame`
companion loop. Additive only — no existing event or type changes.

Payload carries `tickNumber` (1-indexed, monotonic), `virtualDtSeconds`,
`wallDtSeconds`, `selectedAction` summary (or `null`), and a `trace`
reference to the full `DecisionTrace` for consumers who want the complete
tick record. The event is published after the tick's `DecisionTrace` is
assembled, so the meta-event is intentionally **not** included in the
trace's `emitted` array. Replay-equivalence: identical seed → identical
`AgentTicked` sequence.
