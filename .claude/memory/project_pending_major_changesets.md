---
name: Pending 1.0 breaking changesets
description: Which open / merged PRs already carry major-bump changesets queued for the eventual 1.0 publish.
type: project
---

Changesets under `.changeset/*.md` accumulate until the owner cuts the 1.0
release. The pending changeset pile is the source of truth — skim
`.changeset/*.md` before proposing a new changeset. The table below is an
early snapshot (2026-04-24) preserved for context only and no longer
maintained.

| File                       | PR  | Bump  | What breaks                                                                                                                                        |
| -------------------------- | --- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-internal-rename.md` | #65 | major | `Agent._internalPublish` / `_internalDie` renamed to `Agent.publishEvent` / `Agent.routeDeath`. Internal but reachable.                            |
| `narrow-public-surface.md` | #67 | major | `AgentDependencies` removed from the public barrel; `AgentModule` / `ReactiveHandler` / `Needs` / `Modifiers` / `AgeModel` tagged `@experimental`. |
| `llm-provider-port.md`     | #66 | minor | `LlmProviderPort` + `MockLlmProvider` added — public-surface addition.                                                                             |
| `tfjs-learner.md`          | #70 | minor | `TfjsLearner` added to the `agentonomous/cognition/adapters/tfjs` subpath.                                                                         |

**How to apply:**

- Before proposing more major-bump changesets, skim this file so the running
  count stays visible.
- When the owner lifts the 1.0 hold, the changeset CLI folds all pending
  entries into a single changelog block. The order here hints at the
  sections it'll generate.
- If a pending item changes in a later PR (e.g. rename target changes),
  update the relevant changeset file in that PR instead of adding a new one.
