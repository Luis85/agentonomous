---
name: scaffold-agent-skill
description: Scaffolds a new agentonomous `Skill` (a library concept — NOT a Claude skill) in `src/skills/defaults/` with its mirror test under `tests/unit/skills/defaults.test.ts`. Use when the user asks to "add a skill", "create a skill", "new agent skill", or names a verb to wire up (e.g. "add a groom skill"). Produces skill file + optional modifier + registers it in the defaults barrel, following the existing patterns (see `FeedSkill.ts`, `PetSkill.ts`).
---

# scaffold-agent-skill — add a new default agent Skill

Terminology trap: "Skill" in this repo is a **library concept** from
`src/skills/Skill.ts` — an autonomous-agent capability like `feed`, `pet`,
or `medicate`. This skill creates a new one of those. It is NOT about
Claude Code skills.

## Before you start

Confirm with the user:

1. **Skill id** — lowercase, kebab-case verb. Examples: `groom`, `train`,
   `comfort`.
2. **Label** — human-readable (`"Groom"`, `"Train"`).
3. **What needs it satisfies** — one or more of `hunger`, `energy`,
   `happiness`, `health`, or a new species-specific need.
4. **Does it apply a modifier?** If yes, need id, duration, stack policy
   (`refresh` / `replace` / `ignore`), and effect targets
   (`need-decay` / `mood-bias` / `intention-score` / `skill-effectiveness`).
5. **Is it a player-invoked active skill or an autonomous expressive
   skill?** Active → goes into `defaultActiveSkills`. Expressive →
   `defaultExpressionSkills`.
6. **Gate condition?** ScoldSkill only fires when `disobedient` is active
   — make the equivalent explicit if present.

If any of the above is ambiguous, ask. Don't guess satisfy values out of
thin air — anchor them to `SKILL_DEFAULTS` in `src/cognition/tuning.ts`.

## Files to create / touch

1. `src/skills/defaults/<Pascal>Skill.ts` — the skill export.
2. `src/cognition/tuning.ts` — add a `<id>` block to `SKILL_DEFAULTS`.
3. `src/skills/defaults/index.ts` — import + re-export + add to the
   appropriate array (`defaultActiveSkills` or `defaultExpressionSkills`)
   and to `defaultPetInteractionModule.skills` if active.
4. `tests/unit/skills/defaults.test.ts` — add a `describe` block mirroring
   the existing pattern (`makeCtx()` helper is already in the file).

## Template (active skill with modifier)

```ts
// src/skills/defaults/<Pascal>Skill.ts
import { ok, type Result } from '../../agent/result.js';
import { SKILL_DEFAULTS } from '../../cognition/tuning.js';
import { defineModifier } from '../../modifiers/defineModifier.js';
import type { Skill, SkillError, SkillOutcome } from '../Skill.js';
import type { SkillContext } from '../SkillContext.js';
import { effectivenessFor } from './effectiveness.js';

const <buffName> = defineModifier({
  id: '<buff-id>',
  source: 'skill:<id>',
  stack: 'refresh',
  durationSeconds: SKILL_DEFAULTS.<id>.<durationKey>,
  effects: [
    {
      target: { type: '<target-type>', <targetKey>: '<targetValue>' },
      kind: 'add' /* or 'multiply' */,
      value: SKILL_DEFAULTS.<id>.<effectKey>,
    },
  ],
  visual: { hudIcon: 'icon-<id>', fxHint: '<fx-hint>' },
});

/**
 * Default `<id>` skill. One-line description of what it does.
 */
export const <Pascal>Skill: Skill = {
  id: '<id>',
  label: '<Label>',
  baseEffectiveness: 1,
  execute(_params, ctx: SkillContext): Promise<Result<SkillOutcome, SkillError>> {
    const effectiveness = effectivenessFor(<Pascal>Skill, ctx);
    ctx.satisfyNeed('<needId>', SKILL_DEFAULTS.<id>.<needKey> * effectiveness);
    ctx.applyModifier(<buffName>.instantiate(ctx.clock.now()));
    return Promise.resolve(ok({ fxHint: '<fx-hint>', effectiveness }));
  },
};
```

For skills without a modifier, drop the `defineModifier` block and the
`applyModifier` call.

For skills that need a gate (see `ScoldSkill.ts`), import `err` from
`result.js`, check `ctx.hasModifier('<gate-id>')`, and return
`err({ code: '<reason-code>', message: '…' })` when the gate is missing.

## Tuning block

```ts
// src/cognition/tuning.ts — inside SKILL_DEFAULTS
<id>: {
  <needKey>: 0.3,        // how much of the need is satisfied at eff=1
  <durationKey>: 60,     // buff duration (seconds)
  <effectKey>: -0.5,     // effect value
},
```

Comment-free is fine — the keys are self-documenting. Stay in the
0-to-1-ish range unless you have a reason not to.

## Registration

Edit `src/skills/defaults/index.ts`:

```ts
import { <Pascal>Skill } from './<Pascal>Skill.js';
// …
export const defaultActiveSkills = [
  FeedSkill, CleanSkill, PlaySkill, RestSkill, ScoldSkill,
  PetSkill, MedicateSkill, <Pascal>Skill,
] as const;

export const defaultPetInteractionModule: AgentModule = {
  // …
  skills: [..., <Pascal>Skill],
  // …
};

export { <Pascal>Skill /* keep alphabetical order */ };
```

If it's an expression skill instead, add to `defaultExpressionSkills` and
omit the `defaultPetInteractionModule.skills` entry.

## Test

Add to `tests/unit/skills/defaults.test.ts` (follow the FeedSkill /
PetSkill pattern already there):

```ts
describe('<Pascal>Skill', () => {
  it('satisfies <needId> and applies <buff-id>', async () => {
    const { ctx, modifiers, needs, events } = makeCtx();

    const result = await <Pascal>Skill.execute({}, ctx);

    expect(result.ok).toBe(true);
    expect(needs.level('<needId>')).toBeGreaterThan(<startingLevel>);
    expect(modifiers.has('<buff-id>')).toBe(true);
  });
});
```

For gated skills, add a matching `returns err when <gate-id> is absent`
case and a `clears <gate-id> on success` case (see ScoldSkill tests).

## After scaffolding

1. `npm run typecheck` — should pass immediately.
2. `npm test -- defaults` — the new describe block runs.
3. `npm run verify` — full gate.
4. Changeset: `npm run changeset` (patch bump for a new default skill
   unless it breaks existing consumers).
5. Commit on a topic branch cut from `develop`.

## Do not

- Do NOT add the skill to both `defaultActiveSkills` and
  `defaultExpressionSkills` — they're mutually exclusive by role.
- Do NOT skip the tuning block and hardcode numeric literals in the
  skill file — the whole point of `SKILL_DEFAULTS` is single-source tuning.
- Do NOT touch the `durationSeconds` mutation order (instantiate BEFORE
  publishing events, so the modifier is observable in the event handlers).
- Do NOT export from the barrel if the skill is experimental — put it
  behind a separate module the consumer installs explicitly.
