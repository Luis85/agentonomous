---
'agentonomous': minor
---

Surface the reasoner's candidate list on `DecisionTrace.deltas.candidates`
when autonomous cognition runs.

Each entry is an `IntentionCandidate` — `{ intention, score, source }` —
in the order the needs policy produced it. The field is omitted on ticks
where the reasoner didn't run (remote / scripted control modes) or where
no candidates were produced (e.g. no needs + no needs policy). Ordering
is stable under a fixed seed, preserving the determinism contract.

Presentation layers (including the Phase A nurture-pet demo's upcoming
Decision Trace panel) can read this directly to render Chapter B's
"candidate intentions + scores" explainability view without reaching into
internal cognition classes.
