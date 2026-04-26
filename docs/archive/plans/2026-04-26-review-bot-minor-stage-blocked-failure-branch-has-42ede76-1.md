> **Archived 2026-04-26.** Completed in #122.

---
date: 2026-04-26
slug: review-bot-minor-stage-blocked-failure-branch-has-42ede76-1
finding-id: 42ede76.1
tracker: '#87'
severity: MINOR
---

# Fix review finding `42ede76.1` — `stage-blocked` failure branch has no test

## Source

From `#87` comment 4321324736, finding `42ede76.1`:

> **[MINOR]** `src/agent/internal/CognitionPipeline.ts:143` — `stage-blocked` failure branch has no test
>
> **Problem:** `invokeSkillAction` gained four new `scoreFailure` call sites in this diff; the test file `Agent-learner-failure-score.test.ts` exercises three of them (`err(...)`, throws, `not-registered`) but never the `stage-blocked` branch (requires `ageModel` + `stageCapabilities` set + skill blocked by stage)
>
> **Why it matters:** A future refactor that accidentally drops or mis-shapes the `scoreFailure` call inside the stage-capability gate would go undetected; the branch is structurally distinct from the others because it fires before the registry lookup
>
> **Fix:**
>
> ```diff
> // Add to Agent-learner-failure-score.test.ts
> +it('scores an outcome when a skill is blocked by life stage', async () => {
> +  const blocked: Skill = { id: 'blocked', label: 'Blocked', baseEffectiveness: 1,
> +    execute: () => Promise.resolve(ok({ effectiveness: 1 })) };
> +  const learner = recordingLearner();
> +  const caps = new StageCapabilities({ kit: ['allowed'] }); // 'blocked' absent
> +  const agent = agentWithSkill(blocked, learner, { ageModel: new AgeModel(...), stageCapabilities: caps });
> +  agent.interact('blocked');
> +  await agent.tick(0.016);
> +  expect(learner.calls[0]).toMatchObject({ details: { failed: true, code: 'stage-blocked' } });
> +});
> ```

## Acceptance

- Apply the bot's proposed fix (see body above).
- Add or update tests covering the new code paths.
- `npm run verify` passes locally.
- Codex review on the PR is acknowledged or rebutted on each thread.

## Rollout

- Branch: `fix/review-bot-minor-stage-blocked-failure-branch-has-42ede76-1` (already cut by review-fix skill).
- PR base: `develop`.
- PR body MUST contain on its own line: `Refs #87 finding:42ede76.1`.
- PR body MUST NOT contain `Closes #87` / `Fixes #87`.
- Changeset required if behavior changes (`npm run changeset`).
