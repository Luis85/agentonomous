---
'agentonomous': minor
---

`setTimeScale(0)` now genuinely freezes the agent — modifier expiry
(Stage 2), mood reconciliation (Stage 2.7), and animation reconciliation
(Stage 2.8) are skipped while the scale is zero, so no
`ModifierExpired`, `MoodChanged`, or `AnimationTransition` events leak
during a pause.

`Modifier.expiresAt` is still an absolute wall-clock ms. If a modifier
would have expired during the pause, `ModifiersTicker` detects it on
the first post-resume tick and emits `ModifierExpired` then — the event
is deferred, not cancelled, and not duplicated.

Adopts **Option A** of `.claude/plans/pause-semantics.md`. The more
invasive virtual-time-based expiry (Option B) remains a Phase B
consideration alongside R-08.

Additive: agents that never call `setTimeScale(0)` see identical
behaviour.
