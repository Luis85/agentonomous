---
'agentonomous': minor
---

Add `Agent.setTimeScale(scale)` / `Agent.getTimeScale()` for runtime control
of the wall→virtual time multiplier.

The new scale takes effect on the **next** `tick()` — the in-flight tick (if
any) keeps its original scale, preserving the determinism contract under a
fixed `SeededRng` + `ManualClock`. Pass `0` to freeze simulated time without
killing the agent (`halt()` remains the terminal death gate). Negative,
`NaN`, and infinite scales throw `RangeError`.
