---
date: 2026-04-27
slug: review-bot-minor-attachresethandler-decl-before-d9b4b85-3
finding-id: d9b4b85.3
tracker: '#155'
severity: MINOR
---

# Fix review finding `d9b4b85.3` — `function attachResetHandler` declared before a static `import` statement on line 38

## Source

From `#155` (https://github.com/Luis85/agentonomous/issues/155), finding `d9b4b85.3`:

> **[MINOR]** `tests/examples/learningMode.train.test.ts:27` — `function attachResetHandler` declared before a static `import` statement on line 38
>
> <details><summary>details</summary>
>
> **Problem:** The replacement for the deleted `mountResetButton` import was inserted as a function declaration on line 27, above the surviving `import { TEST_BACKEND } from '../setup/tfjsBackend.js'` on line 38. ES module `import` statements are hoisted at parse time so it works at runtime, but the source order (declaration before import) is non-standard, confuses readers, and will fail under any future `import/first` lint rule.
>
> **Why it matters:** This pattern will silently break if the project ever enables `eslint-plugin-import`'s `import/first` rule, turning a style issue into a blocked build with no obvious connection to the original change. It also signals to readers that the file was edited carelessly, undermining confidence in the surrounding test logic.
>
> **Fix:**
>
> ```diff
> -// `mountResetButton` lived in…
> -function attachResetHandler(agentId: string): void {
> -  …
> -}
>  import { TEST_BACKEND } from '../setup/tfjsBackend.js';
> +
> +// `mountResetButton` lived in…
> +function attachResetHandler(agentId: string): void {
> +  …
> +}
> ```
>
> Move the function below all `import` statements.
>
> </details>

## Acceptance

- Apply the bot's proposed fix (see body above).
- Add or update tests covering the new code paths.
- `npm run verify` passes locally.
- Codex review on the PR is acknowledged or rebutted on each thread.

## Rollout

- Branch: `fix/review-bot-minor-attachresethandler-decl-before-d9b4b85-3` (already cut by review-fix skill).
- PR base: `develop`.
- PR body MUST contain on its own line: `Refs #155 finding:d9b4b85.3`.
- PR body MUST NOT contain `Closes #155` / `Fixes #155`.
- Changeset required if behavior changes (`npm run changeset`).
