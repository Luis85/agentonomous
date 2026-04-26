# 0.9.6 Remove Dead `pendingEvents` Field From `AgentSnapshot` — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `pendingEvents?: readonly DomainEvent[]` field (and its
JSDoc) from the `AgentSnapshot` interface. The field is declared but never
populated by `Agent.snapshot()` and never read by `Agent.restore()` — it's a
dead promise in the public type. Removing it aligns the contract with reality
and prevents future consumers from writing code that depends on a field that
will silently always be `undefined`.

**Architecture:** Single bundled PR. Pure type-level change: delete the field
declaration + its JSDoc block, add a regression test asserting
`Agent.snapshot()` output never produces a `pendingEvents` key, and ship a
minor-bump changeset documenting the public-type shrink. Pre-1.0, the type
shrink is technically breaking — but no consumer can be relying on the field
because nothing ever populated it. The changeset and PR description make this
explicit.

This plan adopts **Option A** from the remediation plan. Option B (full event
queue persistence/rehydration) was considered and rejected: it would require
extending `EventBusPort` with snapshot/restore operations, implementing them
in `InMemoryEventBus`, and persisting/rehydrating queue state in
`Agent.snapshot()` / `Agent.restore()` — a significant feature build with no
known consumer demand. If that demand materializes later, a separate plan
can re-introduce the field with a real implementation.

**Tech Stack:** TypeScript (strict + `exactOptionalPropertyTypes`), vitest,
ESM with `.js` extensions on relative imports. No new runtime deps.

**Design reference:** Remediation plan Workstream 2, Option A path. The plan
explicitly recommends Option A as lowest-complexity and best-aligned with
actual architecture.

---

## File Structure

### New files

- `.changeset/<random>.md` — minor-bump changeset.

### Modified files

- `src/persistence/AgentSnapshot.ts` — delete lines 80–84 (the JSDoc + the
  `pendingEvents?` field declaration). The trailing `}` of the interface and
  the `CURRENT_SNAPSHOT_VERSION` constant stay as-is.
- `tests/unit/persistence/SnapshotStore.test.ts` (or a sibling file under
  `tests/unit/persistence/`) — add one test asserting `Agent.snapshot()` does
  not include a `pendingEvents` key under any tick / module configuration.
  Pick the existing file that most naturally hosts agent-snapshot shape
  assertions; if none fits, create
  `tests/unit/persistence/AgentSnapshot-shape.test.ts`.

### Deliberately untouched

- `src/agent/Agent.ts` — `snapshot()` (lines 627–661) doesn't populate
  `pendingEvents`; `restore()` (lines 679+) doesn't read it. Nothing to
  remove there. **Confirm this in Task 1 before editing the type.**
- `src/persistence/AutoSaveTracker.ts`, `LocalStorageSnapshotStore.ts`,
  `FsSnapshotStore.ts`, `InMemorySnapshotStore.ts` — none touch the field.
- `src/persistence/migrateSnapshot.ts` — there is no version-bumped migration
  here. The field's removal is type-only; on-disk snapshots that happen to
  have a `pendingEvents` array (none should — nothing ever wrote it) will
  decode into an `AgentSnapshot` with the extra property at runtime, and TS
  consumers won't see it through the typed surface. Since the field was
  optional, removing it does **not** require a `schemaVersion` bump.
- `CURRENT_SNAPSHOT_VERSION` (line 87) — stays at `2`.

---

## Task 0: Cut topic branch

**Files:** none (git only).

- [ ] **Step 1: Confirm clean tree on develop.**

Run: `git switch develop && git status && git pull --ff-only origin develop`
Expected: clean tree, fast-forward.

- [ ] **Step 2: Cut the topic branch.**

Run: `git switch -c chore/snapshot-drop-pending-events`

---

## Task 1: Confirm the field is genuinely unreferenced

**Files:** none (verification only).

- [ ] **Step 1: Repo-wide grep.**

Run: `git grep -n pendingEvents`
Expected: exactly one match, in `src/persistence/AgentSnapshot.ts:84`. If
there are matches in `src/agent/Agent.ts`, `tests/`, or anywhere else, **stop
immediately** — the field is in use somewhere and Option A is no longer the
right approach. Re-read the remediation plan and reconsider Option B before
proceeding.

- [ ] **Step 2: Sanity-check `snapshot()` output today.**

Open `src/agent/Agent.ts` lines 627–661. Confirm visually that no branch
populates `snap.pendingEvents`. If a branch does populate it, **stop** —
update this plan (or escalate) before continuing.

- [ ] **Step 3: Sanity-check `restore()` reads.**

Open `src/agent/Agent.ts` lines 679–740. Confirm `snapshot.pendingEvents` is
never read. Same stop rule applies.

> **Why these stops matter:** the entire premise of Option A is that the field
> is dead. If it's not, removing it silently breaks consumers that _do_ depend
> on it. The grep + visual check is the one bit of due diligence that costs
> nothing and prevents a quiet regression.

---

## Task 2: Write the shape-assertion regression test

**Files:**

- Create: `tests/unit/persistence/AgentSnapshot-shape.test.ts` (or append to
  an existing snapshot-shape test if one exists — search first).

- [ ] **Step 1: Search for an existing host file.**

Run: `git grep -l "Agent\.snapshot\(\)" tests/unit/`
If a test already asserts on `Agent.snapshot()` output shape, append to it.
If not, create a new file.

- [ ] **Step 2: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
// + the standard test-agent builder used elsewhere in tests/unit/agent/.

describe('AgentSnapshot shape', () => {
  it('snapshot() output never includes a pendingEvents key', async () => {
    const agent = buildTestAgent({});
    // Tick once + emit some custom events to be paranoid that no codepath
    // populates pendingEvents under any condition.
    await agent.tick(0.016);

    const snap = agent.snapshot();
    expect(snap).not.toHaveProperty('pendingEvents');
  });
});
```

- [ ] **Step 3: Run the test.**

Run: `npm test -- AgentSnapshot-shape`
Expected: **PASS**. The implementation already doesn't populate the field;
this test pins that behavior so a future change can't quietly add it back
without removing this assertion. (The test was written _to_ the current
behavior — its purpose is regression-prevention, not red→green TDD.)

> **Why this test passes immediately:** Option A is removing a field that's
> never populated. There's no "make a failing test pass" step for the
> implementation. The test exists to lock the contract going forward.

---

## Task 3: Remove the field

**Files:**

- Modify: `src/persistence/AgentSnapshot.ts:80-84`

- [ ] **Step 1: Delete the JSDoc block + field.**

Open `src/persistence/AgentSnapshot.ts`. Remove these five lines:

```ts
  /**
   * Pending events queued on the bus at save time. Restored onto the fresh
   * bus so in-flight interactions aren't lost across reload.
   */
  pendingEvents?: readonly DomainEvent[];
```

The interface body now ends after the `custom?: Record<string, unknown>;`
field. The closing `}` and `CURRENT_SNAPSHOT_VERSION` constant on subsequent
lines stay as-is.

- [ ] **Step 2: Drop the now-unused import if applicable.**

Check the file's imports. If `DomainEvent` was only imported to type the
`pendingEvents` field, remove the import line:

```ts
import type { DomainEvent } from '../events/DomainEvent.js';
```

If other fields in the interface still reference `DomainEvent`, leave the
import. Run `npm run typecheck` afterwards to catch any unused-import lint
violations either way.

- [ ] **Step 3: Typecheck.**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run all tests.**

Run: `npm test`
Expected: all tests pass. The shape-assertion test from Task 2 now validates
the contract; existing snapshot/restore tests are unaffected since they never
exercised the dead field.

---

## Task 4: Changeset + commit

**Files:**

- Create: `.changeset/<random>.md`

- [ ] **Step 1: Generate the changeset.**

Run: `npm run changeset`
Choose: `agentonomous` → **minor**.

> **Why minor (not patch):** removing an optional field from a published type
> is technically a breaking type-level change. Pre-1.0, minor bumps are the
> conventional signal for "API surface changed." Even though no consumer can
> be relying on the field (nothing ever populated it), the bump keeps the
> changelog honest.

Summary line:

```
Remove unused `pendingEvents` field from `AgentSnapshot`. The field was
declared but never populated by `Agent.snapshot()` nor read by
`Agent.restore()` — a dead promise in the public type. Consumers cannot
have been relying on it. If event-queue persistence is needed, it should
be re-introduced with a real implementation.
```

- [ ] **Step 2: Commit.**

```bash
git add src/persistence/AgentSnapshot.ts tests/unit/persistence/*.ts .changeset/*.md
git commit -m "chore(persistence): remove dead AgentSnapshot.pendingEvents field

The field was declared at AgentSnapshot.ts:84 but nothing in src/
populated or read it. A regression test in
tests/unit/persistence/AgentSnapshot-shape.test.ts now pins the absent
key so a future change can't quietly resurrect it without an
implementation.

Type-level breaking change documented in changeset."
```

---

## Task 5: Verify + PR

**Files:** none.

- [ ] **Step 1: Full pre-PR gate.**

Run: `npm run verify`
Expected: all stages green.

- [ ] **Step 2: Push and open PR.**

```bash
git push -u origin chore/snapshot-drop-pending-events
gh pr create --base develop --title "chore(persistence): 0.9.6 remove dead AgentSnapshot.pendingEvents field" --body "$(cat <<'EOF'
## Summary
- Remove `pendingEvents?: readonly DomainEvent[]` from `AgentSnapshot`.
- The field was declared at `src/persistence/AgentSnapshot.ts:84` but never populated by `Agent.snapshot()` nor read by `Agent.restore()`.
- New regression test `tests/unit/persistence/AgentSnapshot-shape.test.ts` pins the absent key.
- No `schemaVersion` bump — the field was optional and on-disk snapshots that happen to contain it (none should — nothing ever wrote it) decode into an `AgentSnapshot` whose typed surface no longer exposes it.

Type-level breaking change. Documented as a `minor` changeset. If event-queue persistence is genuinely wanted later, re-introduce with a real implementation (see remediation plan Workstream 2 Option B for the rough shape — out of scope here).

Addresses remediation plan Workstream 2 (Option A).

## Test plan
- [ ] `npm run verify` green locally.
- [ ] `tests/unit/persistence/AgentSnapshot-shape.test.ts` asserts the field is absent from `snapshot()` output.
- [ ] Existing snapshot/restore suite still green (no test exercised the dead field).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: After merge — local cleanup.**

```bash
git switch develop
git pull origin develop
git branch -d chore/snapshot-drop-pending-events
git fetch --prune origin
```

---

## Risks & escape hatches

| Risk                                                     | Mitigation                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field is referenced somewhere the grep missed            | Task 1's three-step verification (repo grep + visual check of `snapshot()` + visual check of `restore()`) should catch this. If any of those uncover a reference, **stop and re-evaluate** before deleting the field.                     |
| External consumer depended on the field's typed presence | Vanishingly unlikely — nothing ever populated it, so any consumer that read it always got `undefined`. Documented as a minor-bump in the changeset; consumers running `npm update` will see it in the changelog.                          |
| Removing the field changes JSON wire format              | No. The field was optional — `JSON.stringify(snapshot)` already produced output without `pendingEvents` keys (because `snapshot()` never set it). Wire format is byte-identical post-fix.                                                 |
| Future re-introduction needs the same name               | If event-queue persistence is added later, `pendingEvents` is still a fine name. The minor-bump notice + this PR's body document the prior absence so a future re-introduction won't be confused with a "restoration" of broken behavior. |

## Out of scope (hard — if any of these appears during execution, stop and defer)

- Implementing Option B (extending `EventBusPort` with queue snapshot/restore +
  populating/reading `pendingEvents`). That's a feature build, not a cleanup.
- Bumping `CURRENT_SNAPSHOT_VERSION`. The field was optional and never written;
  no migration is needed.
- Removing other unused fields from `AgentSnapshot`. Each requires the same
  three-step verification — bundle them into separate PRs if found.
- Refactoring `Agent.snapshot()` or `Agent.restore()` beyond what this fix
  requires (which is nothing — they don't reference the field).
