---
'agentonomous': patch
---

Fix: `Agent.restore()` now replaces modifier state instead of merging it.

Prior behavior applied each snapshot modifier on top of whatever the
target agent was already carrying, leaving pre-existing buffs/debuffs
live after the restore. Needs decay multipliers and mood biases stacked
on top of the snapshot's own, producing behavior drift that diverged
from snapshot truth.

The fix clears the target agent's modifier collection before applying
`snapshot.modifiers`, regardless of whether that slice is present on
the snapshot. Expired-on-restore boundary handling (R-16) and the
`ModifierExpired` emit semantics are unchanged.

Only the post-restore modifier-collection contents change; no public
API surface moves.
