> **Archived 2026-04-26.** Completed (0.9.7 row of the v1 plan).

# 0.9.8 Fail Fast on Duplicate `SkillRegistry` IDs — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `SkillRegistry.register(skill)` throw a typed
`DuplicateSkillError` when a skill with the same id is already registered,
so silent overwrites — today's most common source of "my skill works in
isolation but not when I add module X" bugs — fail loudly. Add an explicit
`replace(skill)` method for the legitimate "I intend to override this skill"
use case, so consumers who rely on overwrite can migrate with a one-character
edit rather than losing the capability entirely.

**Architecture:** Single bundled PR. `register()` throws when `has(id)` is
true. New `replace(skill)` method unconditionally sets (no-throw). New
`DuplicateSkillError` type alongside the existing `SkillInvocationError`
in `src/agent/errors.ts`. Two backward-compat callers inside the library
migrate: `createAgent.ts:208` (module skill auto-install) guards with
`has()` before `register()` so consumer-pre-registered skills win without
throwing; demo `main.ts` drops redundant pre-registration of module skills
since `createAgent` installs them automatically. First dedicated test file
for `SkillRegistry` (no coverage exists today).

**Tech Stack:** TypeScript (strict + `exactOptionalPropertyTypes`), vitest,
ESM with `.js` extensions on relative imports. No new runtime deps.

**Design reference:** Remediation plan Workstream 4. The "fail fast" choice
aligns with the project's "no silent data-loss" principle already applied
elsewhere (see `InvalidTimeScaleError` in `Agent.setTimeScale`).

---

## File Structure

### New files

- `tests/unit/skills/SkillRegistry.test.ts` — first test file for the
  registry. Covers (a) duplicate-register throws, (b) `registerAll` throws
  on any duplicate in the batch, (c) `replace` unconditionally overwrites,
  (d) `get` / `has` / `list` unchanged.
- `.changeset/<random>.md` — **minor-bump** changeset. This is behavior-
  breaking for callers that relied on silent overwrite.

### Modified files

- `src/skills/SkillRegistry.ts` — update `register()` to throw on duplicate,
  add `replace()` method, update class JSDoc.
- `src/agent/errors.ts` — add `DuplicateSkillError` alongside
  `SkillInvocationError`.
- `src/agent/createAgent.ts:204-210` — module skill auto-install loop guards
  with `skills.has(skill.id)` before calling `register()`. Consumer-supplied
  skill registry takes precedence over module defaults (non-breaking
  semantic preservation).
- `examples/nurture-pet/src/main.ts:85-91` — drop the redundant
  `skills.registerAll(defaultPetInteractionModule.skills ?? [])` line
  (these seven skills are installed by `createAgent`'s module pass). Keep
  the four non-module registrations (`ExpressMeowSkill`, `ExpressSadSkill`,
  `ExpressSleepySkill`, `ApproachTreatSkill`).

### Deliberately untouched

- `src/skills/Skill.ts` — `Skill` interface unchanged.
- `src/skills/SkillContext.ts` — unchanged.
- `src/skills/defaults/*` — default skill implementations unchanged.
- `src/needs/Needs.ts`, `src/species/SpeciesRegistry.ts`,
  `src/randomEvents/RandomEventTicker.ts` — each has its own `register()`
  that also silently overwrites. Applying the same fail-fast pattern to
  them is a valid follow-up but **out of scope** for this PR. Bundle-scope
  keeps the review surface contained.

---

## Task 0: Prerequisites + cut topic branch

**Files:** none (git only).

- [ ] **Step 1: Audit internal callers of `SkillRegistry.register`.**

Run: `git grep -n "skills\.register\|registerAll"`
Record the matches. Expected set (as of plan-writing):

- `src/agent/createAgent.ts:208` — module skill auto-install (fix below).
- `src/skills/SkillRegistry.ts:19` — internal `registerAll` → `register`.
- `examples/nurture-pet/src/main.ts:85-91` — demo wiring (fix below).
- `tests/integration/nurture-pet-deterministic.test.ts`, `parallel-
agent-determinism.test.ts`, `agent-ticked-replay.test.ts` — integration
  tests. Confirm they don't double-register.
- `tests/unit/agent/Agent-skills.test.ts` — unit test; confirm no double-
  register.

If any match outside this list shows a double-register pattern, treat it
as in-scope for this PR.

- [ ] **Step 2: Confirm clean tree on develop.**

Run: `git switch develop && git status && git pull --ff-only origin develop`
Expected: clean, fast-forward.

- [ ] **Step 3: Cut the topic branch.**

Run: `git switch -c feat/skill-registry-fail-fast-duplicates`

---

## Task 1: Introduce `DuplicateSkillError`

**Files:**

- Modify: `src/agent/errors.ts`

- [ ] **Step 1: Read the existing error class.**

Open `src/agent/errors.ts`. `SkillInvocationError` is already defined there
(it's imported by `SkillRegistry.ts:1`). Match its shape.

- [ ] **Step 2: Add `DuplicateSkillError`.**

Append:

```ts
/**
 * Thrown by `SkillRegistry.register()` when a skill with the same `id`
 * is already registered. Fail-fast prevents silent overrides — the
 * common root cause of "my skill works in isolation but not when I add
 * module X" bugs. Consumers who intend to override should call
 * `registry.replace(skill)` instead.
 */
export class DuplicateSkillError extends Error {
  readonly skillId: string;

  constructor(skillId: string) {
    super(
      `Skill '${skillId}' is already registered. Use registry.replace(skill) if overwrite is intentional.`,
    );
    this.name = 'DuplicateSkillError';
    this.skillId = skillId;
  }
}
```

- [ ] **Step 3: Typecheck.**

Run: `npm run typecheck`
Expected: no errors.

---

## Task 2: Write the failing `SkillRegistry` tests

**Files:**

- Create: `tests/unit/skills/SkillRegistry.test.ts`

- [ ] **Step 1: Scaffold the test file.**

```ts
import { describe, expect, it } from 'vitest';
import { DuplicateSkillError } from '../../../src/agent/errors.js';
import { ok } from '../../../src/agent/result.js';
import type { Skill } from '../../../src/skills/Skill.js';
import { SkillRegistry } from '../../../src/skills/SkillRegistry.js';

function stub(id: string): Skill {
  return {
    id,
    async execute() {
      return ok({ effectiveness: 1 });
    },
  };
}

describe('SkillRegistry.register', () => {
  it('registers a new skill', () => {
    const r = new SkillRegistry();
    r.register(stub('feed'));
    expect(r.has('feed')).toBe(true);
    expect(r.get('feed')?.id).toBe('feed');
  });

  it('throws DuplicateSkillError when the id is already registered', () => {
    const r = new SkillRegistry();
    r.register(stub('feed'));
    expect(() => r.register(stub('feed'))).toThrowError(DuplicateSkillError);
  });

  it('includes the skill id on the thrown error', () => {
    const r = new SkillRegistry();
    r.register(stub('feed'));
    try {
      r.register(stub('feed'));
    } catch (err) {
      expect(err).toBeInstanceOf(DuplicateSkillError);
      expect((err as DuplicateSkillError).skillId).toBe('feed');
      return;
    }
    throw new Error('expected DuplicateSkillError');
  });
});

describe('SkillRegistry.registerAll', () => {
  it('registers all when there are no duplicates', () => {
    const r = new SkillRegistry();
    r.registerAll([stub('a'), stub('b'), stub('c')]);
    expect(r.list()).toHaveLength(3);
  });

  it('throws on the first duplicate and leaves earlier registrations in place', () => {
    const r = new SkillRegistry();
    r.register(stub('a'));
    expect(() => r.registerAll([stub('b'), stub('a'), stub('c')])).toThrowError(
      DuplicateSkillError,
    );
    // 'b' registered before 'a' threw; 'c' did not.
    expect(r.has('b')).toBe(true);
    expect(r.has('c')).toBe(false);
  });
});

describe('SkillRegistry.replace', () => {
  it('overwrites an existing skill without throwing', () => {
    const r = new SkillRegistry();
    const original = stub('feed');
    const override = { ...stub('feed'), meta: 'override' } as Skill;
    r.register(original);
    r.replace(override);
    expect(r.get('feed')).toBe(override);
  });

  it('adds a skill that was not previously registered', () => {
    const r = new SkillRegistry();
    r.replace(stub('feed'));
    expect(r.has('feed')).toBe(true);
  });
});
```

- [ ] **Step 2: Run; confirm failure.**

Run: `npm test -- SkillRegistry`
Expected: the two duplicate-register tests and both replace tests fail
(`register` currently silently overwrites; `replace` doesn't exist).
`registerAll` partial-registration test also fails.

---

## Task 3: Update `SkillRegistry` behavior

**Files:**

- Modify: `src/skills/SkillRegistry.ts`

- [ ] **Step 1: Update the class.**

Replace the current class body with:

```ts
import { DuplicateSkillError, SkillInvocationError } from '../agent/errors.js';
import type { Result } from '../agent/result.js';
import type { Skill, SkillError, SkillOutcome } from './Skill.js';
import type { SkillContext } from './SkillContext.js';

/**
 * Registry + invoker for skills. Consumers (modules or manual wiring)
 * call `register(skill)`; the Agent calls `invoke(id, params, ctx)` when
 * a behavior action says so.
 *
 * `register()` throws `DuplicateSkillError` if a skill with the same id
 * is already registered — silent overrides have been the most common
 * source of "my skill works in isolation but not when I add module X"
 * bugs. Consumers who intend to override should call `replace(skill)`.
 */
export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();

  /**
   * Register a skill by its id. Throws `DuplicateSkillError` if the id
   * is already in the registry. Call `replace()` for intentional
   * overrides.
   */
  register(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      throw new DuplicateSkillError(skill.id);
    }
    this.skills.set(skill.id, skill);
  }

  /**
   * Register every skill in `skills` by delegating to `register()`. If
   * a duplicate is encountered, the prior registrations stay in place
   * and `DuplicateSkillError` propagates — there is no rollback.
   */
  registerAll(skills: readonly Skill[]): void {
    for (const s of skills) this.register(s);
  }

  /**
   * Unconditionally insert or overwrite the skill. Use this when you
   * intentionally want to swap out a default skill for a customized
   * implementation; `register()` throws in the same scenario so the
   * intent must be explicit.
   */
  replace(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  has(id: string): boolean {
    return this.skills.has(id);
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  list(): readonly Skill[] {
    return [...this.skills.values()];
  }

  /**
   * Invoke a skill by id. Throws `SkillInvocationError` if the skill
   * isn't registered (infrastructure failure). Returns the skill's
   * `Result` for domain-level success/failure.
   */
  async invoke(
    id: string,
    params: Record<string, unknown> | undefined,
    ctx: SkillContext,
  ): Promise<Result<SkillOutcome, SkillError>> {
    const skill = this.skills.get(id);
    if (!skill) {
      throw new SkillInvocationError(id, `Skill '${id}' is not registered.`);
    }
    return skill.execute(params, ctx);
  }
}
```

- [ ] **Step 2: Run the registry tests.**

Run: `npm test -- SkillRegistry`
Expected: all 7 `SkillRegistry` tests pass.

- [ ] **Step 3: Run the full suite; expect failures in callers.**

Run: `npm test`
Expected: failures in callers that relied on silent overwrite — most
likely `tests/integration/nurture-pet-deterministic.test.ts` (if it
instantiates a demo-like setup) and any path that imports the demo's
wiring. Read the failure messages; each `DuplicateSkillError` is
pointing at a genuine double-registration.

Do **not** fix the failures by adding `replace()` everywhere — the
default path should use `has()`-guarded `register()` so consumer-supplied
skills win. Fix by either (a) removing the redundant pre-registration,
or (b) gating with `has()`. Use `replace()` only when the override is
genuinely intentional.

---

## Task 4: Update `createAgent` module auto-install

**Files:**

- Modify: `src/agent/createAgent.ts:204-210`

- [ ] **Step 1: Guard module registration with `has()`.**

Replace:

```ts
// Auto-install any skills contributed by config-time modules so the
// SkillRegistry is fully populated by the time the agent starts ticking.
for (const mod of config.modules ?? []) {
  for (const skill of mod.skills ?? []) {
    skills.register(skill);
  }
}
```

With:

```ts
// Auto-install any skills contributed by config-time modules so the
// SkillRegistry is fully populated by the time the agent starts
// ticking. Consumer-pre-registered skills take precedence — a skill
// already in the registry is not overridden by a module default, so
// an explicit `skills.register(customFeedSkill)` before createAgent()
// still wins even when the module also ships a FeedSkill.
for (const mod of config.modules ?? []) {
  for (const skill of mod.skills ?? []) {
    if (!skills.has(skill.id)) skills.register(skill);
  }
}
```

- [ ] **Step 2: Re-run the full suite.**

Run: `npm test`
Expected: the previous cascade of `DuplicateSkillError` failures in
tests that pass both a pre-populated `skills` registry AND `modules:
[defaultPetInteractionModule]` is resolved — the module pass no-ops on
already-present ids.

If tests still fail, inspect each: it's a legitimate duplicate the test
was silently relying on. Decide case-by-case — `has()`-guard the caller
or call `replace()` if overwrite was intentional.

---

## Task 5: Update demo `main.ts` to stop redundant pre-registration

**Files:**

- Modify: `examples/nurture-pet/src/main.ts:85-91`

- [ ] **Step 1: Drop the redundant line.**

Replace:

```ts
// --- Skill registry populated with active + expressive defaults ---------------
const skills = new SkillRegistry();
skills.registerAll(defaultPetInteractionModule.skills ?? []);
skills.register(ExpressMeowSkill);
skills.register(ExpressSadSkill);
skills.register(ExpressSleepySkill);
skills.register(ApproachTreatSkill);
```

With:

```ts
// --- Skill registry populated with expressive + approach defaults -------------
// `createAgent({ modules: [defaultPetInteractionModule] })` auto-installs
// that module's seven active-care skills (feed/clean/play/rest/pet/
// scold/medicate) — no need to pre-register them here. Register the
// expressive + approach-treat skills manually since they are not
// bundled in any module.
const skills = new SkillRegistry();
skills.register(ExpressMeowSkill);
skills.register(ExpressSadSkill);
skills.register(ExpressSleepySkill);
skills.register(ApproachTreatSkill);
```

- [ ] **Step 2: Smoke test the demo build.**

Run: `npm run demo:dev`
Expected: Vite dev server starts cleanly, the pet loads, Feed/Clean/
Play/Rest/Pet/Scold/Medicate buttons all work (their skills are
auto-installed via the module path inside `createAgent`). Kill the
server after the smoke check.

> **Why this is safe:** `createAgent`'s module iteration (now guarded
> with `has()`) will register the module's seven skills because the
> demo's pre-populated registry doesn't contain them anymore. Express/
> approach skills stay pre-registered because no module supplies them.

---

## Task 6: Full verify + changeset

**Files:**

- Create: `.changeset/<random>.md`

- [ ] **Step 1: Run the full pre-PR gate.**

Run: `npm run verify`
Expected: all stages green.

- [ ] **Step 2: Generate the changeset.**

Run: `npm run changeset`
Choose: `agentonomous` → **minor**.

Summary:

```
Breaking: SkillRegistry.register() now throws DuplicateSkillError on
duplicate skill ids. Use SkillRegistry.replace(skill) for intentional
overrides.

Migration: consumers who were silently overwriting a registered skill
should call replace() instead. Consumers who doubly-register the same
skill (e.g., pre-registering a module's skills AND passing the module
via createAgent's modules option) should drop the redundant pre-
registration — createAgent now guards its module-install pass with
registry.has() so consumer-supplied registrations win.

Rationale: silent overwrites were the most common source of 'my skill
works in isolation but not when I add module X' bugs. Fail-fast
surfaces the conflict at registration time.
```

- [ ] **Step 3: Commit.**

```bash
git add src/agent/errors.ts src/skills/SkillRegistry.ts src/agent/createAgent.ts examples/nurture-pet/src/main.ts tests/unit/skills/SkillRegistry.test.ts .changeset/*.md
git commit -m "feat(skills): fail fast on duplicate SkillRegistry.register()

register() now throws DuplicateSkillError when a skill with the same
id is already registered. replace() is the new explicit API for
intentional overrides.

createAgent's module-skill auto-install loop now guards with has(),
preserving the invariant that consumer-pre-registered skills win.
Demo main.ts drops redundant pre-registration of default-module
skills (createAgent installs them automatically).

Breaking for consumers relying on silent overwrite. Migration path:
call replace() for intentional overrides."
```

---

## Task 7: PR + cleanup

**Files:** none.

- [ ] **Step 1: Push and open PR.**

```bash
git push -u origin feat/skill-registry-fail-fast-duplicates
gh pr create --base develop --title "feat(skills): 0.9.8 fail fast on duplicate SkillRegistry IDs" --body "$(cat <<'EOF'
## Summary
- `SkillRegistry.register(skill)` now throws `DuplicateSkillError` when the id is already registered.
- New `SkillRegistry.replace(skill)` for intentional overrides (no-throw).
- New `DuplicateSkillError` in `src/agent/errors.ts`.
- `createAgent` module-skill auto-install now guards with `skills.has(id)` so consumer-pre-registered skills win.
- Demo `main.ts` drops redundant pre-registration of `defaultPetInteractionModule.skills` — `createAgent` installs them automatically.
- First dedicated test file for the registry: `tests/unit/skills/SkillRegistry.test.ts` — 7 tests covering register / registerAll / replace / error payloads.

**Breaking for consumers that relied on silent overwrite.** Minor bump. Migration path documented in the changeset.

Addresses remediation plan Workstream 4.

## Test plan
- [ ] `npm run verify` green locally.
- [ ] Duplicate register throws `DuplicateSkillError` carrying `skillId`.
- [ ] `registerAll` throws on first duplicate, prior registrations in the batch remain.
- [ ] `replace` overwrites without throwing; also works when the id is absent.
- [ ] `npm run demo:dev` — pet loads; Feed/Clean/Play/Rest/Pet/Scold/Medicate all functional.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: After merge — local cleanup.**

```bash
git switch develop
git pull origin develop
git branch -d feat/skill-registry-fail-fast-duplicates
git fetch --prune origin
```

---

## Risks & escape hatches

| Risk                                                                                                                                                              | Mitigation                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External consumer relied on silent overwrite and gets surprised by a runtime throw                                                                                | Documented in the changeset with a migration path (`replace()` or drop redundant registrations). The throw is loud and actionable — `DuplicateSkillError` carries the offending id and the error message names the fix. Preferable to the prior silent-corruption alternative.                                |
| `createAgent` callers who passed both a pre-populated registry and overlapping modules start seeing silent `has()`-skips instead of the previous silent-overwrite | `has()`-skip matches the stated intent ("consumer-supplied skills take precedence") and is the stable backward-compat semantic. The behavior change is from "module overwrites consumer" (previous, silent) to "consumer wins" (new). Document in the PR body so consumers don't assume silence == no change. |
| A test hidden in the suite was asserting on the silent-overwrite behavior                                                                                         | Task 3 Step 3 surfaces these as `DuplicateSkillError` failures. Each one is either (a) a caller bug to fix with `has()`-guard or dedup, or (b) a genuine override intent to fix with `replace()`. The plan explicitly does not auto-paper over with `replace()` — intent must be explicit.                    |
| Follow-on callers across `Needs.register`, `SpeciesRegistry.register`, `RandomEventTicker.register` have the same silent-overwrite shape                          | Out of scope for this PR per the Deliberately Untouched list. If the plan needs to grow, cut follow-up plans per registry — each has a different caller topology and a bundled PR would balloon the review surface.                                                                                           |
| Demo `main.ts` smoke test misses a regression                                                                                                                     | Task 5 Step 2 is mandatory — a minute of manual verification before committing the demo change is cheap insurance. If the smoke fails, the revert is a single `git checkout examples/nurture-pet/src/main.ts`.                                                                                                |

## Out of scope (hard — if any of these appears during execution, stop and defer)

- Applying the fail-fast pattern to `Needs`, `SpeciesRegistry`,
  `RandomEventTicker`, or any other `register()`-style registry. Separate
  plans per registry — each has a different caller topology.
- Adding a `overwrite: true` option to `register()`. The explicit
  `replace()` method is the chosen API. Revisit only if external consumer
  feedback requests the option-bag style after ship.
- Changing `SkillRegistry` to an async API (`async register`). The existing
  sync contract is correct.
- Restructuring `createAgent`'s module-install flow beyond the one-line
  `has()`-guard.
- Bundling the W3 (`FsSnapshotStore` encoding) fix into this PR. Keep
  review surfaces narrow — each workstream ships as its own PR per the
  remediation plan.
