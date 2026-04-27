---
date: 2026-04-27
slug: review-bot-minor-new-reasoner-active-but-d9b4b85-2
finding-id: d9b4b85.2
tracker: '#155'
severity: MINOR
---

# Fix review finding `d9b4b85.2` — new reasoner active but old learner still wired during `await buildLearningLearner`

## Source

From `#155` (https://github.com/Luis85/agentonomous/issues/155), finding `d9b4b85.2`:

> **[MINOR]** `examples/product-demo/src/cognitionSwitcher.ts:442` — new reasoner active but old learner still wired during `await buildLearningLearner`
>
> <details><summary>details</summary>
>
> **Problem:** `agent.setReasoner(reasoner)` is called at line 442, but `activeLearner` is not updated until line 453 — after `await swapLearner(mode.id, reasoner)` on line 448. Any `AgentTicked` events that fire during the `buildLearningLearner` async gap score outcomes from the NEW reasoner against the OLD learner.
>
> **Why it matters:** On a switch into `learning` mode the old `NoopLearner` is still wired; the first N ticks' training observations are silently discarded rather than feeding the new `TfjsLearner`. On a switch out of `learning` mode, the outgoing `TfjsLearner` receives one-to-several misclassified outcomes from the incoming heuristic/BDI/BT reasoner before it is disposed.
>
> **Fix:**
>
> ```diff
> // examples/product-demo/src/cognitionSwitcher.ts (onChange handler)
> -      agent.setReasoner(reasoner);
> -      activeReasoner = reasoner;
> -      activeModeId = mode.id;
> -      disposeIfOwned(previousReasoner);
> -      // Swap learners after the reasoner is in place…
> -      const learner = await swapLearner(mode.id, reasoner);
> +      // Build the new learner BEFORE committing the reasoner swap so
> +      // the agent never runs with a mismatched (reasoner, learner) pair.
> +      const learner = await swapLearner(mode.id, reasoner);
>        if (disposed || myEpoch !== changeEpoch) {
> +        disposeLearner(learner);
>          disposeIfOwned(reasoner);
>          return;
>        }
> +      agent.setReasoner(reasoner);
> +      activeReasoner = reasoner;
> +      activeModeId = mode.id;
> +      disposeIfOwned(previousReasoner);
> ```
>
> </details>

## Acceptance

- Apply the bot's proposed fix (see body above).
- Add or update tests covering the new code paths.
- `npm run verify` passes locally.
- Codex review on the PR is acknowledged or rebutted on each thread.

## Rollout

- Branch: `fix/review-bot-minor-new-reasoner-active-but-d9b4b85-2` (already cut by review-fix skill).
- PR base: `develop`.
- PR body MUST contain on its own line: `Refs #155 finding:d9b4b85.2`.
- PR body MUST NOT contain `Closes #155` / `Fixes #155`.
- Changeset required if behavior changes (`npm run changeset`).
