---
'agentonomous': minor
---

Add `Agent.setReasoner(reasoner)` and `Agent.getReasoner()` so consumers
can live-swap the cognition reasoner on an already-constructed agent
without rebuilding it.

The tick pipeline reads the reasoner fresh each tick, so a swap takes
effect on the next `selectIntention` call — use it to build UIs that
toggle between heuristic / BT / BDI / learned reasoners at runtime.
`setReasoner` throws `TypeError` on null, undefined, or objects without
a `selectIntention` method; nothing is transferred from the outgoing
reasoner, so adapters that want continuity should persist their own
state.
