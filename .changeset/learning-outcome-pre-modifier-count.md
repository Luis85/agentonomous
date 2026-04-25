---
'agentonomous': minor
---

`CognitionPipeline.invokeSkillAction` now snapshots
`agent.modifiers.list().length` before invoking the skill and includes
it on every `LearningOutcome.details` payload as `preModifierCount`
(success + every failure branch). Mirrors the existing `preNeeds`
snapshot.

Consumers that include "active modifier count" as a feature dim should
read this from `details.preModifierCount` to avoid leaking skill-
applied modifier mutations into training inputs — default skills like
`FeedSkill` add buffs and `CleanSkill` removes debuffs during
`execute()`, so `agent.getState().modifiers.length` at outcome time
reflects post-skill state, not the state inference saw.
