# 0.9.5 Unify `AgentFacade.publishEvent` With Internal Publish Path — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route `AgentFacade.publishEvent` through the same internal publish path
that skill context and kernel-originated events use, so every facade-published
event (a) appears in the current tick's `DecisionTrace.emitted` list and (b) is
observed by the autosave event-trigger tracker. Today `facade().publishEvent`
writes straight to `eventBus.publish(event)`, bypassing both hooks — creating a
silent divergence between "what subscribers saw" and "what the trace records"
and suppressing event-driven autosaves originated by reactive handlers or
module `onInstall` hooks.

**Architecture:** Single bundled PR. One-line change inside the `facade()`
builder in `Agent.ts` swapping `this.eventBus.publish(event)` for
`this._internalPublish(event)` — mirroring the pattern already used by
`CognitionPipeline.skillContext().publishEvent`. No schema changes, no port
contract changes, no consumer migration. Two spy-agent tests assert the two
invariants (trace inclusion + autosave observation). The fix is a bug fix, not
an API change.

**Tech Stack:** TypeScript (strict + `exactOptionalPropertyTypes`), vitest,
ESM with `.js` extensions on relative imports. No new runtime deps.

**Design reference:** Remediation plan Workstream 1 (the facade-bypass
finding). The existing skill-context publish path at
`src/agent/internal/CognitionPipeline.ts:220-222` is the known-good reference
pattern.

---

## File Structure

### New files

- `tests/unit/agent/Agent-facade-publish.test.ts` — two regression tests: (1)
  facade-published events land on `DecisionTrace.emitted`, (2) facade-published
  events are counted by the autosave event-trigger tracker.
- `.changeset/<random>.md` — patch bump changeset (via `npm run changeset`).

### Modified files

- `src/agent/Agent.ts` — lines 894–896 inside `facade()`. Replace the raw
  `this.eventBus.publish(event)` call with `this._internalPublish(event)`. No
  other changes to this file.

### Deliberately untouched

- `src/agent/AgentFacade.ts` — the interface shape is unchanged; consumers
  continue to call `facade.publishEvent(event)` as before.
- `src/agent/internal/CognitionPipeline.ts` — already routes skill-context
  publishes through `_internalPublish`. This plan aligns the facade with that
  existing behavior.
- `src/events/DomainEvent.ts`, `src/events/EventBusPort.ts`,
  `src/persistence/AutoSaveTracker.ts` — all out of scope. The fix is behind
  the facade; the downstream APIs don't change.
- Any snapshot schema — no snapshot-shape implications.

---

## Task 0: Cut topic branch

**Files:** none (git only).

- [ ] **Step 1: Confirm clean tree on develop.**

Run: `git switch develop && git status && git pull --ff-only origin develop`
Expected: `On branch develop`, `nothing to commit, working tree clean`,
fast-forward or already up to date.

- [ ] **Step 2: Cut the topic branch.**

Run: `git switch -c fix/facade-publish-event-unify`

---

## Task 1: Regression test for trace inclusion

**Files:**

- Create: `tests/unit/agent/Agent-facade-publish.test.ts`

- [ ] **Step 1: Inspect the existing test-harness patterns.**

Open `tests/unit/agent/Agent-persistence.test.ts` and
`tests/unit/agent/Agent-restore-reset.test.ts` to confirm the in-repo idiom
for constructing a test agent with `ManualClock` + `SeededRng` + an injected
`EventBus` / `SkillRegistry`. Reuse it — do not introduce a new fixture style.

- [ ] **Step 2: Write the failing test for trace inclusion.**

Create `tests/unit/agent/Agent-facade-publish.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AgentFacade } from '../../../src/agent/AgentFacade.js';
import type { AgentModule } from '../../../src/agent/AgentModule.js';
import type { DomainEvent } from '../../../src/events/DomainEvent.js';
// + the standard test-agent builder used elsewhere in tests/unit/agent/.

describe('AgentFacade.publishEvent', () => {
  it('places facade-published events into the current tick trace', async () => {
    let facadeRef: AgentFacade | null = null;
    const captureFacade: AgentModule = {
      id: 'capture-facade',
      reactiveHandlers: [],
      onInstall: (facade) => {
        facadeRef = facade;
      },
    };

    const agent = buildTestAgent({ modules: [captureFacade] });
    // facade was captured during construction; publish before the tick starts.
    const custom: DomainEvent = { type: 'FacadeCustom', at: 0 } as DomainEvent;
    facadeRef!.publishEvent(custom);

    const trace = await agent.tick(0.016);

    expect(trace.emitted.some((e) => e.type === 'FacadeCustom')).toBe(true);
  });
});
```

> **Note:** `buildTestAgent` is whatever local helper the existing
> `tests/unit/agent/*.test.ts` suite uses. If no shared helper exists, inline
> the construction — don't extract a new helper under this PR.

- [ ] **Step 3: Run the test; confirm failure.**

Run: `npm test -- Agent-facade-publish`
Expected: the assertion `trace.emitted.some((e) => e.type === 'FacadeCustom')`
returns `false` because the facade path bypasses `emittedThisTick`. The test
reports the failure against that line.

---

## Task 2: Regression test for autosave observation

**Files:**

- Modify: `tests/unit/agent/Agent-facade-publish.test.ts`

- [ ] **Step 1: Read the autosave event-trigger wiring.**

Open `src/persistence/AutoSaveTracker.ts` and scan for
`observeEvent(eventType)` — confirm the event type is a string. Then open
`tests/unit/persistence/AutoSavePolicy.test.ts` for the idiomatic way to
assert `shouldSave()` transitions.

- [ ] **Step 2: Append the failing autosave test.**

Append this block to `Agent-facade-publish.test.ts`:

```ts
it('observes facade-published events through the autosave tracker', async () => {
  let facadeRef: AgentFacade | null = null;
  const captureFacade: AgentModule = {
    id: 'capture-facade',
    reactiveHandlers: [],
    onInstall: (facade) => {
      facadeRef = facade;
    },
  };

  const snapshotStore = new InMemorySnapshotStore();
  const agent = buildTestAgent({
    modules: [captureFacade],
    persistence: {
      snapshotStore,
      autoSave: {
        // Tight trigger: save after any `FacadeCustom` event is observed.
        onEvents: ['FacadeCustom'],
        minIntervalSeconds: 0,
      },
      autoSaveKey: 'test-pet',
    },
  });

  // Tick once so the autosave tracker becomes active.
  await agent.tick(0);
  expect(await snapshotStore.list()).toEqual([]);

  facadeRef!.publishEvent({ type: 'FacadeCustom', at: 0 } as DomainEvent);
  await agent.tick(0);

  expect(await snapshotStore.list()).toEqual(['test-pet']);
});
```

> **Flexibility:** the exact `persistence` config shape must match
> `AgentConfig['persistence']` in `src/agent/createAgent.ts`. If the keys
> above don't match, copy from `tests/unit/persistence/AutoSavePolicy.test.ts`.

- [ ] **Step 3: Run both tests; confirm both fail.**

Run: `npm test -- Agent-facade-publish`
Expected: both `it(...)` cases fail. The autosave test fails because
`AutoSaveTracker.observeEvent('FacadeCustom')` is never invoked — the
`snapshotStore.list()` stays empty.

---

## Task 3: Apply the fix

**Files:**

- Modify: `src/agent/Agent.ts:894-896`

- [ ] **Step 1: Replace the bypassing publish call.**

Open `src/agent/Agent.ts`. Find the `facade()` method — the relevant block is:

```ts
publishEvent: (event: DomainEvent) => {
  this.eventBus.publish(event);
},
```

Replace the body with:

```ts
publishEvent: (event: DomainEvent) => {
  this._internalPublish(event);
},
```

That's the entire production change. `_internalPublish` (defined at
`Agent.ts:286-288`) already calls `this.publish(event)`, which pushes onto
`emittedThisTick`, invokes `autoSaveTracker?.observeEvent(event.type)`, and
then delegates to `this.eventBus.publish(event)`. The facade now has
identical semantics to the skill-context publish path.

- [ ] **Step 2: Typecheck.**

Run: `npm run typecheck`
Expected: no errors. `_internalPublish` is already `@internal public` so the
facade closure can call it.

- [ ] **Step 3: Run the targeted tests.**

Run: `npm test -- Agent-facade-publish`
Expected: both tests pass.

- [ ] **Step 4: Run the full suite.**

Run: `npm test`
Expected: all tests pass. Pay particular attention to
`tests/integration/nurture-pet-deterministic.test.ts:217` — that test uses
`facade.publishEvent` in a reactive handler; the new behavior means the
published event now also appears on the trace, which may alter an assertion
on `trace.emitted.length` or on tick-cursor expectations. If that test fails,
update its expected trace contents to include the previously-missing event —
the integration test was asserting buggy behavior.

---

## Task 4: Changeset + commit

**Files:**

- Create: `.changeset/<random>.md`

- [ ] **Step 1: Generate the changeset.**

Run: `npm run changeset`
Choose: `agentonomous` → **patch**. Summary line:

```
Fix: route AgentFacade.publishEvent through the internal publish path so
reactive-handler and module-onInstall events appear in the tick trace's
`emitted` list and are observed by the autosave event-trigger tracker.
```

- [ ] **Step 2: Commit.**

```bash
git add src/agent/Agent.ts tests/unit/agent/Agent-facade-publish.test.ts .changeset/*.md
git commit -m "fix(agent): unify AgentFacade.publishEvent with internal publish path

facade().publishEvent wrote straight to eventBus.publish, which bypassed
both emittedThisTick (trace inclusion) and autoSaveTracker.observeEvent
(autosave triggers). Reactive handlers and module onInstall hooks that
published events would produce traces that disagreed with what
subscribers saw, and their events never triggered event-gated autosaves.

Route through _internalPublish — same path the skill context already
uses. No public API change."
```

---

## Task 5: Verify + PR

**Files:** none.

- [ ] **Step 1: Full pre-PR gate.**

Run: `npm run verify`
Expected: `format:check`, `lint`, `typecheck`, `test`, `build` all green.

- [ ] **Step 2: Push and open PR.**

```bash
git push -u origin fix/facade-publish-event-unify
gh pr create --base develop --title "fix(agent): 0.9.5 unify facade publishEvent with internal publish" --body "$(cat <<'EOF'
## Summary
- `AgentFacade.publishEvent` now routes through `_internalPublish`, matching the path `CognitionPipeline.skillContext().publishEvent` already uses.
- Facade-published events (from reactive handlers, module `onInstall` hooks) now appear on `DecisionTrace.emitted` and are observed by `AutoSaveTracker.observeEvent`.
- No public API change — fixes a latent divergence between facade and skill-context publish semantics.

## Test plan
- [ ] `npm run verify` green locally.
- [ ] `tests/unit/agent/Agent-facade-publish.test.ts` covers trace inclusion + autosave observation.
- [ ] Existing `tests/integration/nurture-pet-deterministic.test.ts` still green (its facade-publish assertion may need its `emitted` expectations tightened; flag in PR discussion if so).

Addresses remediation plan Workstream 1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: After merge — local cleanup.**

```bash
git switch develop
git pull origin develop
git branch -d fix/facade-publish-event-unify
git fetch --prune origin
```

---

## Risks & escape hatches

| Risk                                                                            | Mitigation                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing integration test relied on facade events _not_ being in the tick trace | `tests/integration/nurture-pet-deterministic.test.ts:217` is the only known facade-publish call site outside this test. If it relied on the buggy behavior, the fix is to update the test's expected `emitted` length — **not** to revert or add a compatibility shim. Document in the PR. |
| An autosave-triggered save fires during a tick that facade code didn't intend   | Autosave event triggers are opt-in via `persistence.autoSave.onEvents`. Consumers who don't list their custom event type won't see new saves. Default cadence-based autosave is unaffected.                                                                                                |
| `_internalPublish` semantic drifts between versions                             | Keep the new call site consistent with `CognitionPipeline.ts:220-222`. If `_internalPublish`'s body changes later, both consumers benefit uniformly — that's the point of the unification.                                                                                                 |
| Double-publish regression introduced by the fix                                 | `_internalPublish` calls `this.publish()` which calls `this.eventBus.publish()` once. No extra hop. The regression test asserts trace inclusion (implicitly: exactly one entry).                                                                                                           |

## Out of scope (hard — if any of these appears during execution, stop and defer)

- Any change to `AgentFacade` interface shape. `publishEvent` stays 1-arg.
- Any change to `SkillContext.publishEvent` — already correct.
- Any change to `EventBusPort` or `InMemoryEventBus`.
- Any change to `AutoSaveTracker` — the fix flows through it unchanged.
- Any snapshot schema change. `pendingEvents` and friends are addressed in
  plan 0.9.6, not here.
- Refactoring `_internalPublish` away or renaming it. That API has other
  callers (e.g. `CognitionPipeline.ts:203`); touching it expands the review
  surface beyond this fix.
