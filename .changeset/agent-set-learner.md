---
'agentonomous': minor
---

Add `Agent.setLearner(learner)` and `Agent.getLearner()` so consumers
can live-swap the Stage-8 learner on an already-constructed agent —
mirrors the existing `setReasoner` / `getReasoner` surface.

Stage 8 (`learner.score`) now also fires from every `SkillFailed`
branch (stage-blocked, not-registered, execution-threw, and
err-returning skills), with `details.failed: true` plus the failure
`code` / `message`. Success outcomes still carry
`details.effectiveness`. `NoopLearner` ignores both as before; consumer
learners can label success / failure pairs by switching on
`details.failed` in their `toTrainingPair` projection.

`setLearner` throws `TypeError` on null, undefined, or objects without
a `score` method. Nothing is transferred from the outgoing learner;
callers that want to drain pending evidence should `flush()` /
`dispose()` it before swapping.
