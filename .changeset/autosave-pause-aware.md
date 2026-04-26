---
'agentonomous': patch
---

Fix: `setTimeScale(0)` now pauses auto-save in addition to the existing
Stage 2 / 2.7 / 2.8 freezes. Previously, paused ticks still counted
toward `everyTicks`, so the default policy (`{ everyTicks: 5 }`) would
persist a fresh snapshot every ~5 rAF frames (~80 ms) while the rest
of the simulation was explicitly frozen — noticeable as localStorage
churn in the nurture-pet demo while paused. Event-triggered saves
(via the `onEvents` policy field) still fire during pause, so a
critical event like `AgentDied` published by a reactive handler is
still persisted.
