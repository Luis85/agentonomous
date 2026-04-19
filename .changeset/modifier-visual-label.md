---
'agentonomous': minor
---

Add `Modifier.visual.label?: string` for human-readable display names.

Renderers should prefer `label` over the raw `id` when present. The
field is optional and additive — existing modifiers and consumers are
unaffected. Demo consumers like the nurture-pet HUD can now show
"Happy glow" instead of `happy-glow` in the buffs/debuffs tray.
