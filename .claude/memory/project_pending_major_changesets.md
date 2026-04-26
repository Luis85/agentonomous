---
name: Pending 1.0 breaking changesets
description: Which open / merged PRs already carry major-bump changesets queued for the eventual 1.0 publish.
type: project
originSessionId: 6f19e206-9f41-4d74-83ca-15c93838fba3
---

Changesets under `.changeset/*.md` accumulate until the owner cuts the 1.0
release. As of 2026-04-24, two major-bump changesets are queued (plus one
minor-bump port addition that also lives in the same train):

| File                       | PR  | Bump  | What breaks                                                                                                                                        |
| -------------------------- | --- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-internal-rename.md` | #65 | major | `Agent._internalPublish` / `_internalDie` renamed to `Agent.publishEvent` / `Agent.routeDeath`. Internal but reachable.                            |
| `narrow-public-surface.md` | #67 | major | `AgentDependencies` removed from the public barrel; `AgentModule` / `ReactiveHandler` / `Needs` / `Modifiers` / `AgeModel` tagged `@experimental`. |
| `llm-provider-port.md`     | #66 | minor | `LlmProviderPort` + `MockLlmProvider` added — public-surface addition.                                                                             |
| `tfjs-learner.md`          | #70 | minor | `TfjsLearner` added to the `agentonomous/cognition/adapters/tfjs` subpath.                                                                         |

Plus the older backlog from the tfjs-adapter PR and Phase A work under
`.changeset/` (all pre-1.0).

**How to apply:**

- Before proposing more major-bump changesets, skim this file so the running
  count stays visible.
- When the owner lifts the 1.0 hold, the changeset CLI folds all pending
  entries into a single changelog block. The order here hints at the
  sections it'll generate.
- If a pending item changes in a later PR (e.g. rename target changes),
  update the relevant changeset file in that PR instead of adding a new one.
