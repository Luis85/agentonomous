> **Archived 2026-04-26.** Completed (0.9.4 row of the v1 plan).

# 0.9.4 `Reasoner.reset()` Harmonization — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift `reset()` to the `Reasoner` port as an optional method and have the
kernel invoke it at two fixed call sites — after `Agent.setReasoner(next)` (on the
incoming reasoner) and after `Agent.restore(...)` (on the live reasoner, after
catch-up). Any stateful reasoner gets correct clean-slate semantics for free; the
`BrainJsReasoner` stays opt-out because it has no ephemeral state to clear.

**Architecture:** Single bundled PR. One optional method added to the `Reasoner`
interface. Two three-line changes to `Agent.ts` (both call sites use
`reasoner.reset?.()` so the null-safe chain handles opt-out adapters without a
kernel-side branch). `MistreevousReasoner` and `JsSonReasoner` already have
working `reset()` methods that match the contract — only JSDoc is added. No
schema changes. Tests for kernel invocation use a spy reasoner; tests for adapter
semantics live in each adapter's existing test file.

**Tech Stack:** TypeScript (strict + `exactOptionalPropertyTypes`), vitest, ESM
with `.js` extensions on relative imports. No new runtime deps.

**Design reference:** See the chat design section approved in the 0.9.4
brainstorm (Q1(b), Q2(a), Q3(a)). Scope decisions locked there are out of scope
to revisit here. No separate design doc — v1-comprehensive-plan.md:126–148
already contains the design; the chat approval layered the three remaining
decisions on top.

---

## File Structure

### New files

- `tests/unit/agent/Agent-setReasoner-reset.test.ts` — spy-reasoner kernel tests
  for the `setReasoner` → `reset` invocation.
- `tests/unit/agent/Agent-restore-reset.test.ts` — spy-reasoner kernel tests for
  the `restore` → `reset` invocation, verifying reset fires _after_ the catch-up
  loop.
- `.changeset/<random>.md` — minor-bump changeset (via `npm run changeset`).

### Modified files

- `src/cognition/reasoning/Reasoner.ts` — add optional `reset?(): void` to the
  `Reasoner` interface with JSDoc pinning the two call-site contract.
- `src/agent/Agent.ts` — invoke `reasoner.reset?.()` at the end of `setReasoner`
  (~line 599) and at the very end of `restore`, after the catch-up loop
  (~line 740).
- `src/cognition/adapters/mistreevous/MistreevousReasoner.ts` — add a one-line
  JSDoc above the existing `reset()` method linking it to the port contract.
- `src/cognition/adapters/js-son/JsSonReasoner.ts` — same JSDoc addition above
  the existing `reset()`.
- `src/cognition/adapters/brainjs/BrainJsReasoner.ts` — add a class-level JSDoc
  sentence explaining why this adapter does **not** implement `reset()` ("no
  ephemeral between-tick state; trained network weights are consumer-owned and
  hydrated via the constructor").
- `tests/unit/cognition/adapters/mistreevous/MistreevousReasoner.test.ts` — new
  test exercising BT `RUNNING` → `reset()` → `READY`.
- `tests/unit/cognition/adapters/js-son/JsSonReasoner.test.ts` — new test
  exercising mutated beliefs → `reset()` → initial beliefs.

### Deliberately untouched

- `src/cognition/reasoning/UrgencyReasoner.ts` / `NoopReasoner.ts` — stateless;
  no `reset()` needed (optional-method contract permits opt-out).
- `src/persistence/AgentSnapshot.ts` — the `beliefs` field stays unused (out of
  scope for 0.9.4 per Q3(a)).

---

## Task 0: Cut topic branch

**Files:** none (git only).

- [ ] **Step 1: Confirm clean tree on develop.**

Run: `git status && git branch --show-current`
Expected: `On branch develop`, `nothing to commit, working tree clean`.

- [ ] **Step 2: Pull develop.**

Run: `git pull --ff-only origin develop`
Expected: `Already up to date.` or a fast-forward.

- [ ] **Step 3: Cut the topic branch.**

Run: `git switch -c feat/reasoner-reset-harmonization`
Expected: `Switched to a new branch 'feat/reasoner-reset-harmonization'`.

---

## Task 1: Extend the `Reasoner` port

**Files:**

- Modify: `src/cognition/reasoning/Reasoner.ts`

- [ ] **Step 1: Add `reset?(): void` to the interface with contract JSDoc.**

Replace the existing `Reasoner` interface (currently lines 29–32) with:

```ts
export interface Reasoner {
  /** Choose an intention this tick, or `null` for idle. */
  selectIntention(ctx: ReasonerContext): Intention | null;

  /**
   * Clear ephemeral between-tick state so the next tick starts from a
   * known-clean baseline. The kernel invokes this at exactly two points:
   *
   * 1. Immediately after `Agent.setReasoner(next)` — on the **incoming**
   *    reasoner. The outgoing reasoner is discarded without a reset call.
   * 2. At the very end of `Agent.restore(...)`, after the catch-up-tick
   *    loop — on the **live** reasoner. Resetting post-catch-up means the
   *    first live post-restore tick starts fresh regardless of the chunk
   *    size used for catch-up.
   *
   * Never called mid-tick. Implementors should clear plan/BT state and
   * per-tick accumulators. Long-lived architecture — trained network
   * weights, configured policies, persona biases — MUST be preserved.
   * Stateless reasoners can omit this method entirely.
   */
  reset?(): void;
}
```

- [ ] **Step 2: Verify typecheck still passes.**

Run: `npm run typecheck`
Expected: no errors. All three adapters satisfy the updated interface — the two
that already have `reset()` match the optional signature; `BrainJsReasoner` is
permitted to omit.

- [ ] **Step 3: Commit.**

```bash
git add src/cognition/reasoning/Reasoner.ts
git commit -m "feat(cognition): add optional reset() hook to Reasoner port

Additive-optional port method. No call sites yet — kernel wiring lands
in the next commits. Mistreevous and js-son adapters already implement
it; brain.js opts out (stateless).

Refs v1-comprehensive-plan.md:126-148."
```

---

## Task 2: Wire `setReasoner` → `reset()`

**Files:**

- Create: `tests/unit/agent/Agent-setReasoner-reset.test.ts`
- Modify: `src/agent/Agent.ts:591–600`

- [ ] **Step 1: Write the failing test.**

Create `tests/unit/agent/Agent-setReasoner-reset.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { Agent } from '../../../src/agent/Agent.js';
import { ManualClock } from '../../../src/ports/clock/ManualClock.js';
import { SeededRng } from '../../../src/ports/rng/SeededRng.js';
import type { Reasoner, ReasonerContext } from '../../../src/cognition/reasoning/Reasoner.js';

function makeSpyReasoner() {
  return {
    selectIntention: vi.fn((_ctx: ReasonerContext) => null),
    reset: vi.fn(() => undefined),
  } satisfies Required<Reasoner>;
}

function makeAgent() {
  return new Agent({
    id: 'test',
    clock: new ManualClock(0),
    rng: new SeededRng(1),
    // ...minimal deps — mirror the shape used in Agent-setReasoner.test.ts
  });
}

describe('Agent.setReasoner → Reasoner.reset', () => {
  it('invokes reset() on the incoming reasoner exactly once, after assignment', () => {
    const agent = makeAgent();
    const incoming = makeSpyReasoner();

    agent.setReasoner(incoming);

    expect(incoming.reset).toHaveBeenCalledTimes(1);
    expect(incoming.selectIntention).not.toHaveBeenCalled(); // reset precedes selection
  });

  it('does NOT invoke reset() on the outgoing reasoner', () => {
    const agent = makeAgent();
    const outgoing = makeSpyReasoner();
    const incoming = makeSpyReasoner();

    agent.setReasoner(outgoing);
    outgoing.reset.mockClear();
    agent.setReasoner(incoming);

    expect(outgoing.reset).not.toHaveBeenCalled();
    expect(incoming.reset).toHaveBeenCalledTimes(1);
  });

  it('fires reset() even when the same reasoner instance is re-set (identity is irrelevant)', () => {
    const agent = makeAgent();
    const spy = makeSpyReasoner();

    agent.setReasoner(spy);
    agent.setReasoner(spy);

    expect(spy.reset).toHaveBeenCalledTimes(2);
  });

  it('does not throw when the incoming reasoner omits reset()', () => {
    const agent = makeAgent();
    const resetless: Reasoner = {
      selectIntention: () => null,
    };

    expect(() => agent.setReasoner(resetless)).not.toThrow();
  });
});
```

> **Implementation note:** mirror the exact `makeAgent()` construction from
> `tests/unit/agent/Agent-setReasoner.test.ts` — the fixture there already
> encapsulates the minimal-deps boilerplate (species, needs, bus, etc.). Import
> or copy it rather than re-deriving.

- [ ] **Step 2: Run it; confirm the first test fails.**

Run: `npm test -- Agent-setReasoner-reset`
Expected: first test fails — `incoming.reset` received 0 calls, expected 1.

- [ ] **Step 3: Wire the reset call in `Agent.setReasoner`.**

Edit `src/agent/Agent.ts:591–600`. After `this.reasoner = reasoner;` (line 599),
append:

```ts
reasoner.reset?.();
```

Update the JSDoc above `setReasoner` (currently roughly lines 580–590) to
mention reset. Concretely: replace the sentence "Nothing is transferred from the
outgoing reasoner — adapters that want continuity should persist their own
state." with "Nothing is transferred from the outgoing reasoner; the incoming
reasoner's `reset?()` fires synchronously after assignment so the next tick
starts from a known-clean baseline."

- [ ] **Step 4: Run the test suite.**

Run: `npm test -- Agent-setReasoner-reset`
Expected: all four tests pass.

- [ ] **Step 5: Commit.**

```bash
git add src/agent/Agent.ts tests/unit/agent/Agent-setReasoner-reset.test.ts
git commit -m "feat(agent): invoke Reasoner.reset() after setReasoner swap

Kernel fires reset?() on the incoming reasoner synchronously, after
assignment. The outgoing reasoner is discarded without a reset call.
Identity swaps still fire reset — JSDoc documents this.

Spy-reasoner tests cover: invocation count, outgoing skipped, identity
swap, reset omission."
```

---

## Task 3: Wire `Agent.restore` → `reset()` (after catch-up)

**Files:**

- Create: `tests/unit/agent/Agent-restore-reset.test.ts`
- Modify: `src/agent/Agent.ts:662–741`

- [ ] **Step 1: Write the failing test.**

Create `tests/unit/agent/Agent-restore-reset.test.ts`. Two assertions:

1. `restore()` invokes `this.reasoner.reset?.()` exactly once.
2. Reset fires **after** the catch-up-tick loop — assert the spy's `reset` call
   order is _after_ the spy's `selectIntention` calls (which fire during
   catch-up ticks).

Sketch:

```ts
import { describe, expect, it, vi } from 'vitest';
import { Agent } from '../../../src/agent/Agent.js';
// ...same imports as Task 2

describe('Agent.restore → Reasoner.reset', () => {
  it('invokes reset() on the live reasoner exactly once, after catch-up ticks', async () => {
    // Build an agent, snapshot it with a deliberate stale-ness window so
    // restore's catch-up loop runs (e.g. clock advanced by a second before
    // restore is called).
    const { agent, snapshot } = await buildSnapshotWithCatchUpWindow();

    const spy = {
      selectIntention: vi.fn(() => null),
      reset: vi.fn(() => undefined),
    };
    const callLog: string[] = [];
    spy.selectIntention.mockImplementation(() => {
      callLog.push('select');
      return null;
    });
    spy.reset.mockImplementation(() => {
      callLog.push('reset');
    });

    agent.setReasoner(spy);
    spy.reset.mockClear(); // ignore the setReasoner-triggered reset
    callLog.length = 0;

    await agent.restore(snapshot);

    expect(spy.reset).toHaveBeenCalledTimes(1);
    expect(callLog.at(-1)).toBe('reset'); // reset is the LAST call, after catch-up selects
  });

  it('does not throw when the live reasoner omits reset()', async () => {
    const { agent, snapshot } = await buildSnapshotWithCatchUpWindow();
    const resetless: Reasoner = { selectIntention: () => null };
    agent.setReasoner(resetless);

    await expect(agent.restore(snapshot)).resolves.not.toThrow();
  });
});
```

> **Implementation note:** `buildSnapshotWithCatchUpWindow()` should snapshot at
> `t=0`, advance the `ManualClock` by e.g. 2 seconds, then return both the agent
> and the snapshot. The restore call will then invoke catch-up `tick()`s, giving
> the spy's `selectIntention` a chance to fire before the final reset. If
> building this helper pushes past ~10 lines, mirror
> `Agent-persistence.test.ts`'s fixture instead.

- [ ] **Step 2: Run it; confirm failure.**

Run: `npm test -- Agent-restore-reset`
Expected: first test fails — `spy.reset` received 0 calls.

- [ ] **Step 3: Wire the reset call in `Agent.restore`.**

Edit `src/agent/Agent.ts`. At the very end of the `restore()` method — after the
`await runCatchUp(...)` call at line 730–739, before the closing `}` at line 741
— append:

```ts
this.reasoner.reset?.();
```

Update the JSDoc above `restore()` to add (as a final paragraph): "After all
subsystem rehydration and catch-up ticks complete, `this.reasoner.reset?()` is
invoked so the first live post-restore tick starts from a known-clean baseline.
Reset fires _after_ catch-up, not before — catch-up ticks are synthetic and
their residual reasoner state (mid-sequence BT nodes, plan accumulators) is
intentionally discarded."

- [ ] **Step 4: Run the test suite.**

Run: `npm test -- Agent-restore-reset`
Expected: both tests pass.

- [ ] **Step 5: Commit.**

```bash
git add src/agent/Agent.ts tests/unit/agent/Agent-restore-reset.test.ts
git commit -m "feat(agent): invoke Reasoner.reset() at end of restore

Kernel fires reset?() on the live reasoner as the final step of
Agent.restore(), after the catch-up-tick loop. Catch-up ticks are
synthetic; their residual reasoner state is intentionally discarded so
the first live post-restore tick starts fresh regardless of chunk size.

Spy-reasoner tests cover invocation count, ordering after catch-up, and
reset omission (no throw)."
```

---

## Task 4: `MistreevousReasoner` — add JSDoc + reset behavior test

**Files:**

- Modify: `src/cognition/adapters/mistreevous/MistreevousReasoner.ts:147–150`
- Modify: `tests/unit/cognition/adapters/mistreevous/MistreevousReasoner.test.ts`

- [ ] **Step 1: Write the failing-if-regressed test.**

In the existing test file, add a new `describe('reset()', () => { ... })` block
at the bottom. Construct an adapter whose tree has a `Sequence` with a
deliberately long-running node; step once so the tree is `RUNNING`; call
`reset()`; assert the tree is back at `READY` (e.g. by asserting the next
`selectIntention` call emits the tree's _first-child_ intention, not the
resumed node).

The exact BT definition should use fixtures from the existing tests in that file
so we don't invent a third scenario.

- [ ] **Step 2: Run the test.**

Run: `npm test -- MistreevousReasoner`
Expected: the new test passes immediately (no implementation change — adapter's
existing `reset()` already matches the contract).

- [ ] **Step 3: Add JSDoc above the existing `reset()`.**

Replace the existing `reset()` method body (lines 147–150 of
`MistreevousReasoner.ts`) with:

```ts
  /**
   * Returns the BT to `READY`. Any `RUNNING` node state — including
   * mid-sequence continuations — is cleared. Implements the `Reasoner.reset`
   * port contract (see `src/cognition/reasoning/Reasoner.ts`).
   */
  reset(): void {
    this.tree.reset();
  }
```

- [ ] **Step 4: Run the full test suite.**

Run: `npm test`
Expected: all tests still pass (no behavior change; JSDoc only plus new test).

- [ ] **Step 5: Commit.**

```bash
git add src/cognition/adapters/mistreevous/MistreevousReasoner.ts tests/unit/cognition/adapters/mistreevous/MistreevousReasoner.test.ts
git commit -m "test(cognition): verify MistreevousReasoner.reset clears BT state

Existing reset() already matched the port contract — adds JSDoc pointing
at the port + a unit test asserting BT RUNNING → reset → READY. No
behavior change."
```

---

## Task 5: `JsSonReasoner` — add JSDoc + reset behavior test

**Files:**

- Modify: `src/cognition/adapters/js-son/JsSonReasoner.ts:182–184`
- Modify: `tests/unit/cognition/adapters/js-son/JsSonReasoner.test.ts`

- [ ] **Step 1: Write the failing-if-regressed test.**

In the existing test file, add a new `describe('reset()', () => { ... })` block
at the bottom. Construct an adapter from initial beliefs; step `selectIntention`
once (which internally calls `agent.next()` and mutates beliefs); capture
`adapter.getBeliefs()`; call `reset()`; assert `adapter.getBeliefs()` is deep
equal to the initial beliefs object.

- [ ] **Step 2: Run the test.**

Run: `npm test -- JsSonReasoner`
Expected: passes immediately (existing `reset()` already rebuilds the agent from
init).

- [ ] **Step 3: Add JSDoc above the existing `reset()`.**

Replace lines 182–184 of `JsSonReasoner.ts` with:

```ts
  /**
   * Rebuilds the wrapped js-son agent from the constructor's initial options:
   * beliefs revert to the initial map; desires and plans are reinstalled from
   * the saved descriptors. Implements the `Reasoner.reset` port contract
   * (see `src/cognition/reasoning/Reasoner.ts`).
   */
  reset(): void {
    this.agent = this.buildAgent();
  }
```

- [ ] **Step 4: Run the full test suite.**

Run: `npm test`
Expected: all tests still pass.

- [ ] **Step 5: Commit.**

```bash
git add src/cognition/adapters/js-son/JsSonReasoner.ts tests/unit/cognition/adapters/js-son/JsSonReasoner.test.ts
git commit -m "test(cognition): verify JsSonReasoner.reset restores initial beliefs

Existing reset() already matched the port contract — adds JSDoc pointing
at the port + a unit test asserting mutated beliefs → reset → initial
beliefs. No behavior change."
```

---

## Task 6: `BrainJsReasoner` — class-level JSDoc note

**Files:**

- Modify: `src/cognition/adapters/brainjs/BrainJsReasoner.ts`

- [ ] **Step 1: Add the JSDoc sentence.**

Above the `BrainJsReasoner` class declaration, extend the existing class JSDoc
(or add one if absent) with a dedicated paragraph:

```
 * This adapter does not implement `Reasoner.reset()`. It has no
 * ephemeral between-tick state: the wrapped `NeuralNetwork` is used in
 * forward-pass-only mode and its weights are consumer-owned (hydrated
 * via the constructor and preserved for the adapter's lifetime). The
 * kernel's null-safe `reset?.()` call handles the absence without
 * requiring a no-op here.
```

- [ ] **Step 2: Verify typecheck still passes.**

Run: `npm run typecheck`
Expected: no errors. (No code change; JSDoc only.)

- [ ] **Step 3: Commit.**

```bash
git add src/cognition/adapters/brainjs/BrainJsReasoner.ts
git commit -m "docs(cognition): document BrainJsReasoner's reset opt-out

Adds a class-level JSDoc paragraph explaining why this adapter does not
implement Reasoner.reset(): stateless at selection time, consumer-owned
weights. The kernel's optional-chain reset?.() handles the absence."
```

---

## Task 7: Verify, changeset, PR

**Files:**

- Create: `.changeset/<random>.md`

- [ ] **Step 1: Full pre-PR gate.**

Run: `npm run verify`
Expected: `format:check`, `lint`, `typecheck`, `test`, `build` all green. Fail
fast: if any stage fails, fix before continuing.

- [ ] **Step 2: Create the changeset.**

Run: `npm run changeset`
Or use the `new-changeset` skill.

Content:

```md
---
'agentonomous': minor
---

**feat(cognition):** `Reasoner` port now exposes an optional `reset()` hook.
The `Agent` kernel invokes it at two fixed call sites:

- Synchronously after `Agent.setReasoner(next)`, on the **incoming** reasoner.
- At the very end of `Agent.restore(...)`, after the catch-up-tick loop, on the
  **live** reasoner.

`MistreevousReasoner` and `JsSonReasoner` already implement `reset()` — they now
formally satisfy the port contract and carry JSDoc linking to it.
`BrainJsReasoner` deliberately opts out: it has no ephemeral between-tick
state, and the kernel's null-safe `reset?.()` call handles the absence without
requiring a no-op.

No schema changes. No breaking changes. Stateless reasoners may continue to
omit `reset()`.
```

- [ ] **Step 3: Commit the changeset.**

```bash
git add .changeset/*.md
git commit -m "chore(changeset): 0.9.4 Reasoner.reset harmonization"
```

- [ ] **Step 4: Push and open the PR.**

```bash
git push -u origin feat/reasoner-reset-harmonization
gh pr create --base develop --title "feat(cognition): 0.9.4 Reasoner.reset() harmonization" --body "$(cat <<'EOF'
## Summary
- Lifts `reset()` to the `Reasoner` port as an optional method.
- `Agent.setReasoner(next)` invokes `next.reset?.()` synchronously.
- `Agent.restore(...)` invokes `this.reasoner.reset?.()` at the very end, after the catch-up-tick loop — so live post-restore ticks start fresh regardless of catch-up chunk size.
- `MistreevousReasoner` + `JsSonReasoner` already had matching `reset()`; JSDoc now links them to the port contract + new unit tests pin the semantics.
- `BrainJsReasoner` opts out (stateless; consumer-owned weights). Class JSDoc documents the rationale.

Unblocks 0.9.3 (brain.js training persistence flow).

## Test plan
- [ ] `npm run verify` green locally (format, lint, typecheck, test, build).
- [ ] Spy-reasoner kernel tests: `Agent-setReasoner-reset`, `Agent-restore-reset`.
- [ ] Adapter reset behavior tests: `MistreevousReasoner`, `JsSonReasoner`.
- [ ] No schema changes — existing persistence tests still green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: After merge — local cleanup.**

```bash
git switch develop
git pull origin develop
git branch -d feat/reasoner-reset-harmonization
git fetch --prune origin
```

Also delete the remote topic branch via the merged-PR UI if the repo setting
didn't auto-delete.

---

## Risks & escape hatches

| Risk                                                                                                            | Mitigation                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Identity-swap surprise — consumer calls `setReasoner(currentReasoner)` expecting a no-op and gets a reset       | JSDoc on both `setReasoner` and the port's `reset?()` documents this. Test 3 in Task 2 pins the behavior.                       |
| Restore ordering — reset wipes reasoner state from catch-up ticks                                               | Intentional. JSDoc on `restore()` documents that catch-up tick state is synthetic and discarded.                                |
| A future subsystem publishes events during restore that the reasoner consumes, and reset wipes that consumption | No current subsystem does this. If one is added, the subsystem's JSDoc should call out the ordering constraint. Flag in review. |
| `buildSnapshotWithCatchUpWindow()` helper in Task 3 grows beyond a small fixture                                | If it crosses ~15 lines, import `Agent-persistence.test.ts`'s existing fixture instead of writing a new one.                    |

## Out of scope (hard — if any of these appears during execution, stop and defer)

- Wiring `AgentSnapshot.beliefs` (per Q3(a) — 0.9.3 doesn't need it either).
- Making `reset()` required on the port (deferred to 1.1 kernel modularization).
- Adding `reset()` to `UrgencyReasoner` / `NoopReasoner` (no state to clear).
- Reasoner-level snapshot/restore hooks.
- Any change to `setReasoner`'s existing type-validation behavior.
