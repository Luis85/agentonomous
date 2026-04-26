# 0.9.1 `AgentTicked` Bus Event — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a new `AgentTicked` domain event at the end of every tick so
consumers can drive UI / store updates from a single subscription rather than
polling `getState()` in a `requestAnimationFrame` companion loop.

**Architecture:** Add `AGENT_TICKED` to the standard event vocabulary, maintain a
monotonic tick counter on `Agent`, and publish the event at the end of
`Agent.tick()` **after** the `DecisionTrace` is assembled — so the event is the
last thing to happen on a completed tick. The event payload carries a reference
to the `DecisionTrace` itself so subscribers don't need a closure cache.

Two load-bearing invariants fall out of the emission ordering:

1. **Trace's `emitted` is snapshot-copied at assembly time** (`emitted:
[...this.emittedThisTick]` instead of the current aliased reference).
   Without this, publishing `AgentTicked` would retroactively mutate the
   trace's `emitted` array via shared reference.
2. **`AgentTicked` is not present in `trace.emitted`.** It's meta-data
   about the tick, not part of it. The snapshot copy in (1) guarantees
   this because the copy is taken before the publish runs.

Non-breaking: additive event vocabulary + an internal snapshot-copy that
tightens an implicit invariant. No existing event changes, no public-type
shifts.

**Tech Stack:** TypeScript (strict + `exactOptionalPropertyTypes`), vitest,
ESM. Deterministic via `ManualClock` + `SeededRng` — no wall-clock calls in
production code.

**Scope:** Two PRs — library first, demo second. Bundling is **not** allowed
here (roadmap bundling guidance for 0.9.1 says "bundle is OK if both are small
and the test coverage stays clean" — the library test sweep alone justifies a
dedicated PR, and the demo's HUD wiring touches independent files).

**Roadmap reference:** `docs/plans/2026-04-19-v1-comprehensive-plan.md → 0.9.1 —
AgentTicked bus event`. Closes the first "still-outstanding" post-P4 item.

---

## File Structure

### Library PR — new files

- `tests/unit/events/AgentTickedEvent.test.ts` — unit test for constant +
  interface compile-time shape (minimal, type-level + one runtime assert).
- `tests/integration/agent-ticked-replay.test.ts` — replay-equivalence
  integration test. Two agents, same seed, same `ManualClock` pattern —
  byte-identical `AgentTicked` sequences.
- `.changeset/agent-ticked-event.md` — minor-bump changeset (additive
  public API).

### Library PR — modified files

- `src/events/standardEvents.ts` — add `AGENT_TICKED` constant +
  `AgentTickedEvent` interface.
- `src/index.ts` — export the new constant + type from the barrel.
- `src/agent/Agent.ts` — add `ticksEmitted` counter field; snapshot-copy
  `this.emittedThisTick` into the trace at assembly (line 420); publish
  `AgentTicked` at end of `tick()` after trace is assembled, before
  `maybeAutoSave()` + return.
- `tests/unit/agent/Agent.test.ts` — add a focused test asserting
  `AgentTicked` is emitted exactly once per completed tick, carries the
  expected payload shape, and is **not** present in the returned trace's
  `emitted` array.

### Demo PR — modified files

- `examples/nurture-pet/src/main.ts` — strip HUD + trace refresh out of
  the rAF loop; add an `agent.subscribe(AGENT_TICKED)` listener that
  drives HUD + trace from `event.trace`; thread `ticked.tickNumber` into
  the trace-render call; wire the new unsubscribe into teardown.
- `examples/nurture-pet/src/traceView.ts` — widen `render` + `buildSummary`
  to accept `tickNumber`; prepend `Tick #N` to the summary HTML.
- `examples/nurture-pet/README.md` — replace the stale `bindAgentToStore`
  bullet with an `AGENT_TICKED`-subscribe bullet; add an "Event-driven UI
  refresh" subsection with a code example.
- `src/events/standardEvents.ts` — append `@see` to `AgentTickedEvent`
  JSDoc pointing at the demo. No runtime change, no changeset.

### Demo PR — no new files

---

## Chunk 1: Library PR — `AgentTicked` event

This chunk produces one minor-bump PR targeting `develop`. Cut topic branch
`feat/agent-ticked-event` from fresh `develop` at the start.

### Task 1.0: Cut topic branch

**Files:** none (git state only)

- [ ] **Step 1: Start from clean `develop`**

```bash
git switch develop
git pull origin develop
git status
```

Expected: `On branch develop`, `working tree clean`, up-to-date with origin.

- [ ] **Step 2: Cut topic branch**

```bash
git switch -c feat/agent-ticked-event
```

Expected: `Switched to a new branch 'feat/agent-ticked-event'`.

---

### Task 1.1: Add `AGENT_TICKED` constant + `AgentTickedEvent` interface

**Files:**

- Modify: `src/events/standardEvents.ts` (append at end, keep the file's
  "grouped by milestone" section-comment style)
- Create: `tests/unit/events/AgentTickedEvent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/events/AgentTickedEvent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AGENT_TICKED, type AgentTickedEvent } from '../../../src/events/standardEvents.js';
import type { DecisionTrace } from '../../../src/agent/DecisionTrace.js';

describe('AgentTicked event vocabulary', () => {
  it('exports the constant as the exact string literal `"AgentTicked"`', () => {
    expect(AGENT_TICKED).toBe('AgentTicked');
  });

  it('accepts a well-formed event shape at compile time', () => {
    const traceStub: DecisionTrace = {
      agentId: 'test',
      tickStartedAt: 1000,
      virtualDtSeconds: 0.1,
      controlMode: 'autonomous',
      stage: 'alive',
      halted: false,
      perceived: [],
      actions: [],
      emitted: [],
    };
    const event: AgentTickedEvent = {
      type: AGENT_TICKED,
      at: 1000,
      agentId: 'test',
      tickNumber: 1,
      virtualDtSeconds: 0.1,
      wallDtSeconds: 0.01,
      selectedAction: null,
      trace: traceStub,
    };
    expect(event.type).toBe('AgentTicked');
    expect(event.tickNumber).toBe(1);
    expect(event.trace).toBe(traceStub);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/events/AgentTickedEvent.test.ts`

Expected: FAIL. Vitest reports `AGENT_TICKED` is not exported from
`standardEvents.ts`.

- [ ] **Step 3: Add the constant + interface**

Append to `src/events/standardEvents.ts` (after the Mood section,
preserving the section-comment rhythm):

```ts
// --- Tick lifecycle (0.9.1) ---
export const AGENT_TICKED = 'AgentTicked' as const;

/**
 * Emitted at the end of every non-halted tick, after the `DecisionTrace`
 * is assembled. Consumers subscribe via `agent.subscribe` to drive UI /
 * store updates without polling `agent.getState()` in a companion loop.
 *
 * The event is **not** included in `trace.emitted` — the trace's
 * `emitted` array is snapshot-copied at assembly, before this event is
 * published, so the meta-event cannot self-reference. Replay
 * equivalence under a fixed seed: identical input sequence produces
 * identical `AgentTicked` sequence (ordering, payloads).
 */
export interface AgentTickedEvent extends DomainEvent {
  type: typeof AGENT_TICKED;
  agentId: string;
  /** 1-indexed, monotonic. Resets only on reconstruction (not on restore). */
  tickNumber: number;
  /** `wallDtSeconds * timeScale` advanced this tick. */
  virtualDtSeconds: number;
  /** The `dtSeconds` argument the host loop passed to `tick()`. */
  wallDtSeconds: number;
  /** Summary of the action the agent selected this tick, or `null` if none. */
  selectedAction: { type: string; skillId?: string } | null;
  /** The full tick trace. Same object returned by `agent.tick()`. */
  trace: DecisionTrace;
}
```

Add an import at the top of `src/events/standardEvents.ts` for
`DecisionTrace`:

```ts
import type { DecisionTrace } from '../agent/DecisionTrace.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/events/AgentTickedEvent.test.ts`

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/events/standardEvents.ts tests/unit/events/AgentTickedEvent.test.ts
git commit -m "feat(events): add AgentTicked event vocabulary"
```

---

### Task 1.2: Export from the public barrel

**Files:**

- Modify: `src/index.ts` (inside the "Standard event constants/types" export
  block at `src/index.ts:241-264`)

- [ ] **Step 1: Add a barrel test**

Append to `tests/unit/events/AgentTickedEvent.test.ts`:

```ts
it('is re-exported from the public barrel', async () => {
  const barrel = await import('../../../src/index.js');
  expect(barrel.AGENT_TICKED).toBe('AgentTicked');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/events/AgentTickedEvent.test.ts`

Expected: FAIL on the new "is re-exported from the public barrel" test —
`barrel.AGENT_TICKED` is `undefined`.

- [ ] **Step 3: Add barrel exports**

In `src/index.ts`, inside the existing `export { ... } from
'./events/standardEvents.js';` block, add `AGENT_TICKED` to the value
exports (alphabetical or grouped — match existing style; appears to be
rough definition-order, so append near the end) and `AgentTickedEvent` to
the type exports:

```ts
  // ...existing...
  SKILL_COMPLETED,
  SKILL_FAILED,
  AGENT_TICKED,
  // ...existing type exports...
  type SkillFailedEvent,
  type AgentTickedEvent,
} from './events/standardEvents.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/events/AgentTickedEvent.test.ts`

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/unit/events/AgentTickedEvent.test.ts
git commit -m "feat(events): export AgentTicked from public barrel"
```

---

### Task 1.3: Add tick counter + emit from `Agent.tick()`

**Files:**

- Modify: `src/agent/Agent.ts`
  - Add field `ticksEmitted: number = 0;` near the other protected state
    (around `src/agent/Agent.ts:204` next to `emittedThisTick`).
  - Inside `tick()`, after `const trace: DecisionTrace = { ... };` is built
    (`src/agent/Agent.ts:411-422`) and before `await this.maybeAutoSave();`,
    increment the counter and publish the `AgentTicked` event.
- Modify: `tests/unit/agent/Agent.test.ts` — add a `describe('AgentTicked
emission', ...)` block near the existing event-emission tests.

- [ ] **Step 1: Write the failing tests**

Add to the imports at the top of `tests/unit/agent/Agent.test.ts` (merge
into the existing import block — the file already imports `createAgent`
and most deps):

```ts
import { AGENT_TICKED, type AgentTickedEvent } from '../../../src/events/standardEvents.js';
import { ArrayScriptedController } from '../../../src/agent/ScriptedController.js';
```

Append this describe block at the end of the file:

```ts
describe('AgentTicked emission', () => {
  it('emits exactly one AgentTicked event per completed tick, after trace is assembled', async () => {
    const bus = new InMemoryEventBus();
    const events: DomainEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(1_000),
      rng: 0,
      eventBus: bus,
    });

    const trace1 = await agent.tick(0.1);

    const ticked1 = events.filter((e) => e.type === AGENT_TICKED) as AgentTickedEvent[];
    expect(ticked1).toHaveLength(1);
    expect(ticked1[0]!.tickNumber).toBe(1);
    expect(ticked1[0]!.agentId).toBe('pet');
    expect(ticked1[0]!.wallDtSeconds).toBeCloseTo(0.1);
    expect(ticked1[0]!.virtualDtSeconds).toBeCloseTo(0.1);
    // Meta-event is NOT in the trace's emitted array (snapshot copy):
    expect(trace1.emitted.some((e) => e.type === AGENT_TICKED)).toBe(false);
    // Payload holds the exact trace the caller received:
    expect(ticked1[0]!.trace).toBe(trace1);

    const trace2 = await agent.tick(0.1);
    const ticked2 = events.filter((e) => e.type === AGENT_TICKED) as AgentTickedEvent[];
    expect(ticked2).toHaveLength(2);
    expect(ticked2[1]!.tickNumber).toBe(2);
    expect(trace2.emitted.some((e) => e.type === AGENT_TICKED)).toBe(false);
    expect(ticked2[1]!.trace).toBe(trace2);
  });

  it('does not emit AgentTicked on a halted short-circuit tick', async () => {
    // Same pattern the lifecycle test uses at tests/unit/agent/Agent-lifecycle.test.ts:57:
    // agent.kill(...) halts the agent; subsequent ticks short-circuit
    // at Stage -1 and return early without running the pipeline.
    const bus = new InMemoryEventBus();
    const events: DomainEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: bus,
    });

    agent.kill('test');
    events.length = 0;

    const trace = await agent.tick(0.1);
    expect(trace.halted).toBe(true);
    expect(events.filter((e) => e.type === AGENT_TICKED)).toHaveLength(0);
  });

  it('populates selectedAction with the first action of the tick, or null', async () => {
    const bus = new InMemoryEventBus();
    const events: DomainEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const scripted = new ArrayScriptedController([
      [{ type: 'noop' }],
      [{ type: 'invoke-skill', skillId: 'meow' }],
      [], // empty tick → selectedAction === null
    ]);
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      eventBus: bus,
      controlMode: 'scripted',
      scripted,
    });

    await agent.tick(0.1);
    await agent.tick(0.1);
    await agent.tick(0.1);

    const ticked = events.filter((e) => e.type === AGENT_TICKED) as AgentTickedEvent[];
    expect(ticked).toHaveLength(3);
    expect(ticked[0]!.selectedAction).toEqual({ type: 'noop' });
    expect(ticked[1]!.selectedAction).toEqual({ type: 'invoke-skill', skillId: 'meow' });
    expect(ticked[2]!.selectedAction).toBeNull();
  });
});
```

**Verified config keys:** `scripted?: ScriptedController` and
`controlMode: 'scripted'` are the actual `CreateAgentConfig` field
names (see `src/agent/createAgent.ts:121-122`). If TS still rejects
the call, grep other `controlMode: 'scripted'` uses in the test suite
and match the existing spelling exactly — don't invent.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/agent/Agent.test.ts`

Expected: FAIL — `AgentTicked` is never emitted.

- [ ] **Step 3: Add counter field + emission in `tick()`**

In `src/agent/Agent.ts`:

**Change 1 — add counter field.** Near the other protected state around
line 204 (look for `emittedThisTick`), add:

```ts
  /** 1-indexed count of `AgentTicked` events emitted. Resets only on reconstruction. */
  protected ticksEmitted: number = 0;
```

**Change 2 — snapshot-copy `emitted` in trace assembly.** Two trace-build
sites currently alias the mutable array:

- `src/agent/Agent.ts:371` — the health-depleted halted return.
- `src/agent/Agent.ts:420` — the normal end-of-tick assembly.

(The Stage -1 short-circuit at line 326 already uses `emitted: []`, a
fresh literal — nothing to change there.)

Replace both aliased reads with a snapshot copy:

```ts
      emitted: [...this.emittedThisTick],
```

For line 371 the change is defence-in-depth — the halted short-circuit
returns before any further publish, so no mutation can occur today.
Still, keeping both live sites snapshot-consistent makes the invariant
local: "`trace.emitted` is always frozen at the moment of assembly,
regardless of what publish() does next."

**Change 3 — emit `AgentTicked` at end of `tick()`.** **After** the
`const trace: DecisionTrace = { ... };` assembly (now around line 422)
and **before** `await this.maybeAutoSave();`, add:

```ts
// Emit AgentTicked as the final act of a completed tick. Placed
// AFTER trace assembly (with its snapshot-copied `emitted`) so the
// meta-event does not appear in its own trace.emitted. Publish
// flows through `this.publish(...)` so subscribers receive it via
// `agent.subscribe` like any other event.
this.ticksEmitted += 1;
const firstAction = actions[0];
const selectedAction =
  firstAction === undefined
    ? null
    : firstAction.type === 'invoke-skill'
      ? { type: firstAction.type, skillId: firstAction.skillId }
      : { type: firstAction.type };
this.publish({
  type: AGENT_TICKED,
  at: tickStartedAt,
  agentId: this.identity.id,
  tickNumber: this.ticksEmitted,
  virtualDtSeconds,
  wallDtSeconds: Math.max(0, dtSeconds),
  selectedAction,
  trace,
} satisfies AgentTickedEvent);
```

Add the import near the top of `Agent.ts`:

```ts
import { AGENT_TICKED, type AgentTickedEvent } from '../events/standardEvents.js';
```

**Critical — halted short-circuits stay untouched** (beyond the
snapshot-copy fix in Change 2). Lines 315-328 and 361-373 return early
and do not emit `AgentTicked`. This is load-bearing for the "does not
emit on halted" test.

**Critical — why `trace` in the payload is safe from circular
reference:** the trace carries `emitted: [...this.emittedThisTick]` —
a frozen snapshot taken _before_ this publish runs. So `event.trace.emitted`
does NOT contain the event itself. After publish, `this.emittedThisTick`
gains the `AgentTicked` entry, but the trace's snapshot is separate and
stays clean. (If a future change drops the snapshot, the meta-event will
appear via the live reference; the test `trace.emitted.some(e => e.type
=== AGENT_TICKED) === false` pins this invariant.)

**Change 4 — exclude `AgentTicked` from the next tick's `perceived`
stream (post-hoc addition, landed in PR #44).** `this.publish(...)` also
pushes onto the event bus's drain queue. On the next tick, Stage 1
drains the queue into `perceived` (`src/agent/Agent.ts` around line
336). Without a filter, the agent would self-perceive its own
tick-boundary marker, which breaks the unit test at
`tests/unit/agent/Agent.test.ts:53` ("drains bus events into perceived
on the next tick") and, more importantly, is architecturally wrong:
`AgentTicked` is a meta/observability event, not a domain stimulus the
cognition pipeline should react to. Fix: at Stage 1 drain, filter the
meta-event out:

```ts
const perceived = this.eventBus.drain().filter((e) => e.type !== AGENT_TICKED);
```

A short code comment at the filter site explains the invariant ("must
not re-enter the cognition pipeline as a perceived stimulus"). The
spec reviewer for Task 1.3 surfaced this during PR #44 review and
accepted it as a necessary-but-unspecified plan extension.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/agent/Agent.test.ts`

Expected: PASS. Also run the full unit suite to catch regressions:

Run: `npm test`

Expected: all existing tests still green. If the
`parallel-agent-determinism` integration test regresses, it is because
the emitted event stream gained a new event — that test asserts
byte-identity on the stream, so the new event being emitted by both
parallel agents keeps identity. **If it fails**, the failure is almost
certainly ordering — one agent emitted AgentTicked at a different stage
than the other. Compare the two agents' first divergent payloads to
diagnose.

- [ ] **Step 5: Commit**

```bash
git add src/agent/Agent.ts tests/unit/agent/Agent.test.ts
git commit -m "feat(agent): emit AgentTicked at end of every completed tick"
```

---

### Task 1.4: Replay-equivalence integration test

**Files:**

- Create: `tests/integration/agent-ticked-replay.test.ts`

Use `tests/integration/parallel-agent-determinism.test.ts` as the
template — it already exercises the "same seed → byte-identical event
stream" pattern. The new test narrows the claim to the `AgentTicked`
sub-stream specifically.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/agent-ticked-replay.test.ts`. The helper shape
mirrors `tests/integration/parallel-agent-determinism.test.ts:40-94`; the
species definition is copied verbatim from there:

```ts
import { describe, expect, it } from 'vitest';
import {
  AGENT_TICKED,
  createAgent,
  defaultPetInteractionModule,
  defineRandomEvent,
  defineSpecies,
  ExpressMeowSkill,
  InMemoryMemoryAdapter,
  ManualClock,
  RandomEventTicker,
  SeededRng,
  SkillRegistry,
  type AgentTickedEvent,
  type DomainEvent,
} from '../../src/index.js';

/**
 * Replay-equivalence proof for the 0.9.1 AgentTicked event.
 *
 * Two agents built with identical seed + clock + species + modules,
 * stepped through the same dt pattern, must produce byte-identical
 * `AgentTicked` sequences (ordering, payloads).
 *
 * Species + helper shape mirror `parallel-agent-determinism.test.ts`
 * so the two suites stay in lock-step.
 */
const AGENT_ID = 'replay-whiskers';

function buildAgent() {
  const clock = new ManualClock(1_700_000_000_000);
  const rng = new SeededRng('agent-ticked-replay');
  const events: DomainEvent[] = [];

  const species = defineSpecies({
    id: 'cat',
    needs: [
      { id: 'hunger', level: 1, decayPerSec: 0.2, criticalThreshold: 0.3 },
      { id: 'cleanliness', level: 1, decayPerSec: 0.15, criticalThreshold: 0.25 },
      { id: 'happiness', level: 0.8, decayPerSec: 0.1, criticalThreshold: 0.25 },
      { id: 'energy', level: 1, decayPerSec: 0.12, criticalThreshold: 0.2 },
      { id: 'health', level: 1, decayPerSec: 0.01, criticalThreshold: 0.2 },
    ],
    lifecycle: {
      schedule: [
        { stage: 'egg', atSeconds: 0 },
        { stage: 'kitten', atSeconds: 3 },
        { stage: 'adult', atSeconds: 12 },
      ],
    },
  });

  const skills = new SkillRegistry();
  skills.registerAll(defaultPetInteractionModule.skills ?? []);
  skills.register(ExpressMeowSkill);

  const randomEvents = new RandomEventTicker([
    defineRandomEvent({
      id: 'surpriseTreat',
      probabilityPerSecond: 0.3,
      cooldownSeconds: 5,
      emit: () => ({ type: 'RandomEvent', subtype: 'surpriseTreat', at: 0 }),
    }),
  ]);

  const agent = createAgent({
    id: AGENT_ID,
    species,
    clock,
    rng,
    timeScale: 1,
    memory: new InMemoryMemoryAdapter(),
    modules: [defaultPetInteractionModule],
    skills,
    randomEvents,
    persistence: false,
  });

  // Structural clone on push — matches parallel-agent-determinism.test.ts:90.
  // Deep-comparing via toEqual is enough, but the clone protects against
  // accidental post-push mutation of shared references.
  agent.subscribe((e) => {
    events.push({ ...e });
  });

  return { agent, clock, events };
}

describe('AgentTicked replay equivalence', () => {
  it('produces byte-identical AgentTicked payloads across two seeded runs', async () => {
    const a = buildAgent();
    const b = buildAgent();

    for (let i = 0; i < 20; i++) {
      a.clock.advance(100);
      b.clock.advance(100);
      await a.agent.tick(0.1);
      await b.agent.tick(0.1);
    }

    const aTicked = a.events.filter((e) => e.type === AGENT_TICKED) as AgentTickedEvent[];
    const bTicked = b.events.filter((e) => e.type === AGENT_TICKED) as AgentTickedEvent[];

    expect(aTicked).toHaveLength(20);
    expect(bTicked).toHaveLength(20);
    expect(aTicked).toEqual(bTicked);
  });
});
```

The test MUST compile under `strict + exactOptionalPropertyTypes`. If
`timeScale: 1` or `persistence: false` are rejected by the current
`CreateAgentConfig`, drop them — both are defaults in the existing
suite and only included for parity. Do not invent config keys.

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npm test -- tests/integration/agent-ticked-replay.test.ts`

Expected: PASS if the emission from Task 1.3 is deterministic.
**If it fails**, the failure mode tells you where non-determinism slipped
in:

- Different `tickNumber` → the counter has shared state (not per-agent).
- Different `at` → somehow using real wall clock somewhere.
- Different `selectedAction` → the action selection path involves
  non-seeded randomness.

Fix the root cause; do not relax the assertion.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/agent-ticked-replay.test.ts
git commit -m "test(integration): assert AgentTicked replay equivalence under fixed seed"
```

---

### Task 1.5: Changeset (minor bump)

**Files:**

- Create: `.changeset/agent-ticked-event.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/agent-ticked-event.md`:

```markdown
---
'agentonomous': minor
---

Emit a new `AgentTicked` domain event at the end of every non-halted
tick. Consumers subscribing via `agent.subscribe` now receive a per-tick
signal without polling `getState()` from a `requestAnimationFrame`
companion loop. Additive only — no existing event or type changes.

Payload carries `tickNumber` (1-indexed, monotonic), `virtualDtSeconds`,
`wallDtSeconds`, and a `selectedAction` summary (or `null`). The event
is published after the tick's `DecisionTrace` is assembled, so the
meta-event is intentionally **not** included in the trace's `emitted`
array. Replay-equivalence: identical seed → identical `AgentTicked`
sequence.
```

- [ ] **Step 2: Commit**

```bash
git add .changeset/agent-ticked-event.md
git commit -m "chore(changeset): AgentTicked event (minor bump)"
```

---

### Task 1.6: Verify + open PR

- [ ] **Step 1: Run the pre-PR gate**

Run: `npm run verify`

Expected: all stages green — `format:check`, `lint`, `typecheck`, `test`,
`build`. **If anything fails, fix the cause; no `--no-verify`.**

- [ ] **Step 2: Push topic branch**

```bash
git push -u origin feat/agent-ticked-event
```

- [ ] **Step 3: Open PR to `develop`**

```bash
gh pr create --base develop --title "feat: AgentTicked bus event (0.9.1 library)" --body "$(cat <<'EOF'
## Summary

- Adds `AGENT_TICKED` / `AgentTickedEvent` to the standard event vocabulary.
- `Agent.tick()` now emits `AgentTicked` at the end of every non-halted
  tick, after the `DecisionTrace` is assembled.
- Replay-equivalence test covers the new emission under a fixed seed.

Implements the library half of 0.9.1 from
`docs/plans/2026-04-19-v1-comprehensive-plan.md`. Demo wiring follows in the
companion PR.

## Test plan

- [ ] `npm run verify` green locally.
- [ ] `AgentTicked` fires exactly once per completed tick.
- [ ] `AgentTicked` does not fire on a halted short-circuit tick.
- [ ] Trace's `emitted` array does not contain the meta-event.
- [ ] Replay-equivalence test passes (20 ticks, two seeded runs).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL. Do NOT merge — wait for review.

- [ ] **Step 4: After merge, post-merge cleanup**

```bash
git switch develop
git pull origin develop
git branch -d feat/agent-ticked-event
git fetch --prune origin
```

- [ ] **Step 5: Update roadmap status**

In `docs/plans/2026-04-19-v1-comprehensive-plan.md`, change the `Status` cell for
row 1 (0.9.1) from `Not drafted` to `Shipped — <merged PR URL>`.

Commit on `develop` directly per the
`feedback_plan_crafting_on_develop` memory (no topic branch, ask before
pushing):

```bash
git add docs/plans/2026-04-19-v1-comprehensive-plan.md
git commit -m "docs(plans): mark 0.9.1 library as shipped"
```

Ask the user to push, per the same memory.

---

## Chunk 2: Demo PR — event-driven UI refresh + AgentTicked consumer showcase

**Context update (post-PR #44 / post-PR #42).** PR #42 ("polish: smooth
HUD + richer event log", merged to `develop` while 0.9.1 library was
in flight) consolidated the demo's UI refresh into the rAF loop and
removed the `bindAgentToStore` HUD hook (see
`examples/nurture-pet/src/main.ts:115` where the dropped hook is now a
one-comment explanation). The demo's user-visible HUD-smoothness goal
is already met.

This chunk's value is architectural, not behavioral: it makes the
nurture-pet demo a **reference implementation** of the
`AgentTicked`-driven consumer pattern. The rAF loop becomes a pure
tick driver; a single `agent.subscribe` listener drives HUD + trace UI
from `event.trace`. Library consumers reading the demo get a clean
template without the "why does the HUD poll every frame?" question.

Scope bundled into this PR:

1. **Core (2.1)** — migrate HUD + trace refresh to an `AGENT_TICKED`
   subscribe listener; rAF becomes a pure tick driver.
2. **Observability polish (2.2)** — surface `tickNumber` in the trace
   panel summary header so the payload's value is visible to a reader
   running the demo.
3. **Docs (2.3)** — update the nurture-pet README's "What it
   demonstrates" list + the Pinia/Zustand wiring example to show the
   `AgentTicked` subscribe pattern. Add a `@see` to the library's
   `AgentTickedEvent` JSDoc pointing at the demo as the reference.
4. **Verify + PR (2.4)**.

### Task 2.0: Cut topic branch

**Files:** none (git state only)

- [ ] **Step 1: Start from clean `develop` with latest plan + library**

```bash
git switch develop
git pull origin develop
git status
```

Expected: `On branch develop`, clean, up-to-date with origin. Develop
must be at commit `c3054df` (library PR #44 merge) or later, plus
plan-doc commit `065fc76` or later.

- [ ] **Step 2: Rebuild so the demo workspace sees the new exports**

```bash
npm install
npm run build
```

Expected: build succeeds. `node_modules/agentonomous/dist/index.d.ts`
(or `dist/index.d.ts` depending on how the workspace links) contains
`AGENT_TICKED` and `AgentTickedEvent`.

- [ ] **Step 3: Cut topic branch**

```bash
git switch -c feat/agent-ticked-demo-wiring
```

---

### Task 2.1: Move HUD + trace refresh from rAF to `AgentTicked` listener

**Files:**

- Modify: `examples/nurture-pet/src/main.ts`

**Current shape** (post-PR #42) at
`examples/nurture-pet/src/main.ts:115-196`. `bindAgentToStore` is
**gone** (replaced by an explanatory comment at lines 115-118); the rAF
loop drives both ticks and UI refresh; teardown plumbing (`stopped`,
`rafHandle`, `unsubscribeModifierDecorator`) is present:

```ts
// HUD updates run from the per-frame RAF loop below — a prior
// `bindAgentToStore` hook also called `hud.update` on every agent event,
// causing two renders on event ticks. The RAF loop already covers
// steady-state repaints.

const unsubscribeModifierDecorator = pet.subscribe((event) => {
  /* ... */
});

let last = performance.now();
let rafHandle = 0;
let stopped = false;
async function loop(now: number): Promise<void> {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  const trace = await pet.tick(dt);
  if (stopped) return;
  const state = pet.getState();
  hud.update(state); // <-- to remove
  traceView.render(trace, state); // <-- to remove
  rafHandle = requestAnimationFrame((t) => {
    void loop(t);
  });
}
```

**Target shape** — a new `AGENT_TICKED` subscribe listener reads the
trace directly off `event.trace` and drives both HUD + trace UI. rAF
drives ticks only. Teardown unsubscribes the new listener too.

- [ ] **Step 1: Extend the import block**

In `main.ts`, append `AGENT_TICKED` and `type AgentTickedEvent` to the
existing `from 'agentonomous'` import block:

```ts
import {
  // ...existing imports preserved...
  AGENT_TICKED,
  type AgentTickedEvent,
} from 'agentonomous';
```

- [ ] **Step 2: Add the UI-refresh subscribe listener**

**Between** the modifier-decorator subscription (ends around line 171
with the `unsubscribeModifierDecorator` assignment) and the `// ---
Game loop` comment, insert:

```ts
// Drive HUD + trace panel off the AgentTicked bus event. The event
// fires once per non-halted tick, synchronously during `pet.tick(dt)`,
// and carries the full `DecisionTrace` on its payload — no closure
// cache needed. See `InMemoryEventBus.publish` for the sync-publish
// semantics that guarantee `event.trace` matches the tick that just
// completed. The rAF loop below is a pure tick driver.
const unsubscribeUiRefresh = pet.subscribe((event) => {
  if (event.type !== AGENT_TICKED) return;
  const ticked = event as AgentTickedEvent;
  const state = pet.getState();
  hud.update(state);
  traceView.render(ticked.trace, state);
});
```

- [ ] **Step 3: Strip HUD + trace calls from the rAF loop**

Replace the `loop()` body. The new body keeps the dt computation, the
`stopped` short-circuit, and the rAF scheduling — but drops the `trace`
capture, the `state` fetch, and both render calls:

```ts
async function loop(now: number): Promise<void> {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  await pet.tick(dt);
  if (stopped) return;
  rafHandle = requestAnimationFrame((t) => {
    void loop(t);
  });
}
```

Update the preceding comment block to match the new role:

```ts
// --- Game loop ----------------------------------------------------------------
// rAF drives `pet.tick(dt)` at display refresh rate. UI refresh
// happens in the AgentTicked subscriber above — no per-frame DOM
// work here.
```

- [ ] **Step 4: Wire the new unsubscribe into teardown**

The existing teardown (function or module-scope cleanup — PR #42
introduced it; grep for `stopped = true` to find it) unsubscribes
`unsubscribeModifierDecorator`. Add `unsubscribeUiRefresh()` next to
it, matching the existing call style.

If teardown is inlined rather than a named function, add the
unsubscribe call wherever `unsubscribeModifierDecorator()` is called.
Do not change teardown ordering beyond appending the new call.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Build + run the demo**

```bash
npm run build
npm run demo:dev
```

Open the demo in the browser. Verify:

- HUD needs bars drain smoothly (event frequency matches tick frequency
  — indistinguishable from current behavior).
- Trace panel (if expanded) updates every tick.
- Hunger reaches critical in ~45 s of wall time at 1× speed (unchanged
  `BASE_TIME_SCALE = 10` calibration at
  `examples/nurture-pet/src/main.ts:52`).
- Random events fire; modifier chips appear with correct labels and
  countdowns.
- No duplicate HUD renders. No console errors. No layout jitter.
- Reset flow still works; no dangling-listener warnings on teardown.

- [ ] **Step 7: Commit**

```bash
git add examples/nurture-pet/src/main.ts
git commit -m "feat(demo): drive HUD + trace refresh from AgentTicked event"
```

---

### Task 2.2: Surface `tickNumber` in the trace panel summary

**Files:**

- Modify: `examples/nurture-pet/src/traceView.ts`
- Modify: `examples/nurture-pet/src/main.ts` (call-site signature update)

**Context.** The trace panel's summary section (built around
`traceView.ts:38-60`, `buildSummary`) currently shows the tick's stage,
time scale, and virtual dt. Adding `tickNumber` makes the
`AgentTicked` payload visible to a demo user and gives "the demo is
live" observability without another panel. Also serves as a
reader-facing example of why `AgentTicked.tickNumber` is useful.

**Design note:** the `tickNumber` lives on `AgentTickedEvent`, **not**
on `DecisionTrace`. So `traceView.render` must take an extra param
rather than deriving from the trace. This is the explicit, honest
shape — no hidden state in the view.

- [ ] **Step 1: Widen `mountTraceView` return type**

In `traceView.ts:16-18`, change:

```ts
export function mountTraceView(agent: Agent): {
  render(trace: DecisionTrace, state: AgentState): void;
};
```

To:

```ts
export function mountTraceView(agent: Agent): {
  render(trace: DecisionTrace, state: AgentState, tickNumber: number): void;
};
```

- [ ] **Step 2: Thread `tickNumber` through `render` and `buildSummary`**

Update the returned `render` function to accept and forward the new
param:

```ts
return {
  render(trace, state, tickNumber) {
    if (panel.dataset.visible !== 'true') return;
    const timeScale = agent.getTimeScale();

    const summary = buildSummary(trace, state, timeScale, tickNumber);
    // ...rest of the existing `render` body unchanged...
  },
};
```

Widen `buildSummary`'s signature to accept `tickNumber: number` as the
trailing parameter, then prepend a `Tick #N` line to the HTML it
returns. The existing `buildSummary` (grep for it in `traceView.ts`)
builds a string; add:

```ts
`<div class="trace-tick-number">Tick #${tickNumber}</div>` +
  // ...existing summary HTML...
```

If there's an existing styling pattern (other `<div class="...">`
classes in the same helper), follow it. If not, inline a minimal style
attribute: `style="font-size: 0.85em; opacity: 0.6; margin-bottom: 4px;"`.

- [ ] **Step 3: Update the call site in `main.ts`**

In the `AGENT_TICKED` subscribe listener from Task 2.1 Step 2, change
the trace-render call to pass the new argument:

```ts
traceView.render(ticked.trace, state, ticked.tickNumber);
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Verify in the browser**

```bash
npm run build
npm run demo:dev
```

Expand the trace panel. Confirm "Tick #N" appears at the top of the
summary and increments on every tick (1, 2, 3, ... from demo reload).
A reload resets to 1 — the counter is per-Agent-instance, not
persisted, per Chunk 1 Task 1.1's JSDoc.

- [ ] **Step 6: Commit**

```bash
git add examples/nurture-pet/src/traceView.ts examples/nurture-pet/src/main.ts
git commit -m "feat(demo): show tickNumber in trace panel summary"
```

---

### Task 2.3: Docs — README consumer pattern + library JSDoc cross-reference

**Files:**

- Modify: `examples/nurture-pet/README.md`
- Modify: `src/events/standardEvents.ts` (JSDoc `@see` only — no
  behavior change)

This task has two independent steps; commit each separately so the
library-touching diff is reviewable on its own.

**Step A: nurture-pet README updates.**

- [ ] **Step 1: Update "What it demonstrates" bullet**

The current list at `examples/nurture-pet/README.md:7-30` includes:

```
- Reactive state binding via `bindAgentToStore` + a minimal DOM HUD.
```

This bullet is stale (bindAgentToStore is no longer in the demo).
Replace it with:

```
- Event-driven UI refresh via `agent.subscribe(AGENT_TICKED)` — a
  single listener reads the full `DecisionTrace` off `event.trace`
  and drives HUD + trace panel each tick. The rAF loop is a pure tick
  driver.
```

- [ ] **Step 2: Add an AgentTicked wiring subsection**

After the existing `## Pinia / Zustand / Redux` section (ends around
line 73), add a new subsection:

````markdown
## Event-driven UI refresh

`AgentTicked` fires once per non-halted tick, carrying the full
`DecisionTrace` on its payload. This is the recommended way to drive
per-tick UI updates from a library consumer:

```ts
import { AGENT_TICKED, type AgentTickedEvent } from 'agentonomous';

const unsubscribe = pet.subscribe((event) => {
  if (event.type !== AGENT_TICKED) return;
  const ticked = event as AgentTickedEvent;
  hud.update(pet.getState());
  traceView.render(ticked.trace, pet.getState());
});

// On teardown:
unsubscribe();
```

Pair this with a `requestAnimationFrame` loop that calls
`pet.tick(dt)` but does not render — the event drives UI. See
`src/main.ts` for the reference implementation.
````

- [ ] **Step 3: Commit the README**

```bash
git add examples/nurture-pet/README.md
git commit -m "docs(demo): document AgentTicked consumer pattern"
```

**Step B: Library JSDoc cross-reference.**

- [ ] **Step 4: Add `@see` to `AgentTickedEvent` JSDoc**

In `src/events/standardEvents.ts`, locate the `AgentTickedEvent`
interface JSDoc block (it currently ends with `identical 'AgentTicked'
sequence (ordering, payloads).`). Append a final line before the
closing `*/`:

```
 * @see examples/nurture-pet/src/main.ts — reference consumer.
 */
```

One line, no runtime effect. Confirms the demo as the canonical
consumer example.

- [ ] **Step 5: Verify nothing else in src/ changed**

```bash
git diff --stat src/
```

Expected: only `src/events/standardEvents.ts` modified, with a single
JSDoc line added.

- [ ] **Step 6: Commit the JSDoc tweak**

```bash
git add src/events/standardEvents.ts
git commit -m "docs(events): crossref AgentTickedEvent to demo consumer"
```

**Note on bundling.** This commit touches `src/` but adds no behavior.
No changeset required (pure docs). Bundling the JSDoc crossref into the
demo PR keeps the "demo showcases the event; library points at the
demo" loop self-contained. If a reviewer objects, the commit is small
enough to cherry-pick into a separate follow-up PR.

---

### Task 2.4: Verify + push + open PR

- [ ] **Step 1: Pre-PR gate**

Run: `npm run verify`

Expected: `lint` / `typecheck` / `test` / `build` all green. `format:check`
may still fail on 227 files due to the pre-existing Windows CRLF issue
(same as PR #44 context); CI runs on Linux with LF and passes.

- [ ] **Step 2: Push topic branch**

Request the user run: `! git push -u origin feat/agent-ticked-demo-wiring`

(Pushes of topic branches usually succeed without prompt; if the
harness blocks, user pushes manually.)

- [ ] **Step 3: Open PR to `develop`**

```bash
gh pr create --base develop --title "feat(demo): AgentTicked-driven UI refresh + reference consumer" --body "$(cat <<'EOF'
## Summary

- Migrates the nurture-pet demo's HUD + trace refresh from the rAF
  loop into an `agent.subscribe(AGENT_TICKED)` listener. rAF becomes a
  pure tick driver. Behaviorally identical (same frequency, same
  outputs), architecturally clean.
- Surfaces `tickNumber` in the trace panel summary header so the
  event payload's value is visible at demo runtime.
- Documents the `AgentTicked` consumer pattern in the nurture-pet
  README and cross-references the demo from the library's
  `AgentTickedEvent` JSDoc (no behavior change, no changeset).

Implements the demo half of 0.9.1 from
`docs/plans/2026-04-19-agent-ticked-event.md`. Chunk 1 (library) landed
as PR #44.

## Test plan

- [x] `npm run lint` / `typecheck` / `test` / `build` green locally.
- [x] Demo at 1× speed — HUD updates smoothly, trace panel shows
      incrementing `Tick #N` header.
- [x] Random events fire; modifiers decorate HUD; reset flow intact.
- [x] No duplicate HUD renders; no console errors; teardown cleanly
      unsubscribes the new listener.
- [ ] `format:check` pre-existing Windows CRLF issue; CI passes on
      Linux.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL.

- [ ] **Step 4: After merge, post-merge cleanup**

(Controller-side, not part of the subagent run.)

```bash
git switch develop
git pull origin develop
git branch -d feat/agent-ticked-demo-wiring
git fetch --prune origin
```

- [ ] **Step 5: Update roadmap status**

In `docs/plans/2026-04-19-v1-comprehensive-plan.md`, row 1 Status →
`Shipped — library #44, demo #<N>`. Commit on `develop` directly per
`feedback_plan_crafting_on_develop` memory; ask the user to push.

---

## Acceptance criteria (plan-level)

Rolled up from roadmap 0.9.0 DoD item #6 + extended for the demo PR's
additional scope:

1. `AgentTicked` fires exactly once per completed tick. _(Chunk 1,
   shipped #44.)_
2. Demo HUD + trace panel refresh via event subscription, not via the
   rAF loop's per-frame polling. _(Chunk 2, Task 2.1.)_
3. `tickNumber` is surfaced in the trace panel and increments
   monotonically from 1 on demo reload. _(Chunk 2, Task 2.2.)_
4. nurture-pet README documents the `AgentTicked` consumer pattern as
   the canonical way to drive per-tick UI. Library's `AgentTickedEvent`
   JSDoc cross-references the demo. _(Chunk 2, Task 2.3.)_
5. Replay with the same seed produces an identical `AgentTicked`
   sequence (enforced by
   `tests/integration/agent-ticked-replay.test.ts`). _(Chunk 1,
   shipped #44.)_
6. `npm run verify` green on `develop` after both PRs merge.

## Risks + mitigations

Carried from the roadmap's risk table:

| Risk                                                                                                      | Mitigation                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentTicked` breaks determinism under snapshot replay                                                    | Emit at a fixed tick stage (after trace assembly, before autosave). Replay-equivalence test in Task 1.4 pins the invariant.                                                                                                                                                                                            |
| `AgentTicked` bloats the event stream and slows high-frequency subscribers                                | The bus already handles every other event synchronously; one more per tick is negligible. The `trace` payload is a reference — no copy — so the cost is essentially free.                                                                                                                                              |
| Trace payload creates a retention leak — subscribers accidentally keep traces alive by stashing the event | The trace is the same object the caller of `tick()` receives. If consumers want per-tick retention they can already do `const traces: DecisionTrace[] = []; agent.subscribe(e => e.type === AGENT_TICKED && traces.push((e as AgentTickedEvent).trace))` — the retention is opt-in, not forced. Document in the JSDoc. |
| Trace payload causes a circular reference (trace.emitted contains the AgentTicked event)                  | Prevented by snapshot-copying `trace.emitted` at assembly (`emitted: [...this.emittedThisTick]`) _before_ the publish runs. The snapshot freezes without the meta-event. Test `trace.emitted.some(e => e.type === AGENT_TICKED) === false` pins the invariant.                                                         |
| Bundle size drifts up by the new export                                                                   | Event constants + a type are ~30 bytes gzipped. Re-measure via `npm run analyze` after library merge. If regression > 1%, audit.                                                                                                                                                                                       |

## Out of scope

- Changing the payload shape post-0.9.1 (e.g., adding stage / mood / needs
  snapshots). Those belong in a follow-up if a real consumer needs them.
- Retiring `bindAgentToStore` as a library export. It remains public for
  consumers who prefer state-slice-based integration (Pinia / Zustand /
  Redux); this plan only repositions `AgentTicked`-subscribe as the
  recommended per-tick refresh mechanism in the demo's README.
- Making the AgentTicked emission opt-in or configurable. Every tick
  emits it, period.
- Folding in 0.9.6 D-item polish (D5 speed-picker visual weight, D6
  dead `#pet-age` div, D7 format spacing). Survey during Chunk 2 drafting
  found most are already done or don't exist in the current demo; any
  residual polish lives in its own plan row (0.9.6).
- Adding a ticks-per-second readout. Possible follow-up if demo
  feedback asks for it, but `tickNumber` alone covers the "is it live?"
  observability need and avoids wall-clock derivation.
