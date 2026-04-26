---
date: 2026-04-26
slug: review-bot-nit-details-premodifiercount-is-42ede76-4
finding-id: 42ede76.4
tracker: '#87'
severity: NIT
---

# Fix review finding `42ede76.4` — `details.preModifierCount` is undocumented in `LearningOutcome` JSDoc

## Source

From `#87` comment 4321324736, finding `42ede76.4`:

> **[NIT]** `src/cognition/learning/Learner.ts:40` — `details.preModifierCount` is undocumented in the `LearningOutcome` JSDoc
>
> **Problem:** The `Learner.ts` docstring enumerates `details.effectiveness`, `details.failed`, `details.code`, `details.message`, and `details.preNeeds` but omits `preModifierCount`, which `CognitionPipeline` always populates on both success and failure branches
>
> **Why it matters:** A consumer implementing `toTrainingPair` from the JSDoc alone would miss the modifier-count feature and silently train on an incomplete feature vector; the field exists in the pipeline and tests but is invisible in the API contract
>
> **Fix:**
>
> ```diff
>  * The cognition pipeline populates `effectiveness` on success and
>  * `{ failed, code, message }` on failure, plus `preNeeds` (a
>  * `Record<needId, level>` snapshot taken before the skill ran)
>  * whenever a `Needs` subsystem is wired — see Stage 8 contract above.
> +* Also populated on every branch: `preModifierCount` — the count of
> +* active modifiers captured before the skill ran (same timing as
> +* `preNeeds`). Include this in training features when the consumer
> +* models buff/debuff state.
> ```

## Acceptance

- Apply the bot's proposed fix (see body above).
- Add or update tests covering the new code paths.
- `npm run verify` passes locally.
- Codex review on the PR is acknowledged or rebutted on each thread.

## Rollout

- Branch: `fix/review-bot-nit-details-premodifiercount-is-42ede76-4` (already cut by review-fix skill).
- PR base: `develop`.
- PR body MUST contain on its own line: `Refs #87 finding:42ede76.4`.
- PR body MUST NOT contain `Closes #87` / `Fixes #87`.
- Changeset required if behavior changes (`npm run changeset`).
