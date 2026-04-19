---
'agentonomous': minor
---

Persist `timeScale` in `AgentSnapshot` so `restore({ catchUp: true })` uses
the snapshotted cadence instead of the rehydrating agent's constructor
value.

Previously a consumer who saved at scale 60 and rehydrated into a fresh
agent at scale 1 saw a divergent catch-up: the elapsed wall time was
scaled by the **current** agent's `timeScale`, not the one in effect at
save time. The snapshot schema now carries `timeScale` explicitly, and
`restore()` applies it before the catch-up block.

Bumps `AgentSnapshot.schemaVersion` from `1` to `2`. Pre-v2 snapshots
migrate forward unchanged; their missing `timeScale` falls through to the
constructor value, preserving legacy behaviour.

Groundwork for R-08 per-subsystem snapshot versioning.
