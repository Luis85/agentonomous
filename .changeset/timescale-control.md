---
'agentonomous': minor
---

Add `Agent.setTimeScale(scale)` / `Agent.getTimeScale()` for runtime
control of the wall→virtual time multiplier.

The new scale takes effect on the **next** `tick()` — the in-flight tick
(if any) keeps its original scale, preserving the determinism contract
under a fixed `SeededRng` + `ManualClock`. Pass `0` to freeze
virtual-time-driven progress (needs decay, aging, random events) without
killing the agent. Note that modifier expiry, mood reconciliation, and
animation transitions are keyed off wall-clock time and therefore continue
to advance even at scale `0` — use `kill(reason)` for terminal halts.

Invalid scales (negative, `NaN`, `Infinity`) throw the new typed
`InvalidTimeScaleError` (code `E_INVALID_TIME_SCALE`).
