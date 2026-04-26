> **Archived 2026-04-26.** Superseded by docs/archive/plans/2026-04-24-tfjs-cognition-adapter.md (PR #60 swapped brain.js for tfjs).

# 0.9.3 brain.js Training Persistence — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a demo-side "Train" button that runs a short brain.js training
batch on a synthetic dataset, persists the trained network via
`network.toJSON()` into its own localStorage key, rehydrates the persisted
network on reload, and wires the network's scalar output into `interpret()` so
trained state is reflected in gameplay (occasional idle ticks below the urgency
threshold). No library changes — demo-internal only.

**Architecture:** Single demo PR, **cut from `develop` after 0.9.4 merges**. One
new mode-gated button mounted inside `#cognition-switcher`. One click handler
that generates 30 pairs from the demo's seeded RNG, calls `.train()`
synchronously on the main thread, writes `.toJSON()` to
`agentonomous/<agentId>/brainjs-network`. The learning-mode factory's
`construct()` checks that key first and falls back to the existing
`learning.network.json` default when absent. `interpret()` changes from a
straight pass-through to an urgency-gate that returns `null` (idle) when the
network's scalar output drops below a constant threshold. Reset clears both the
agent snapshot and the brainjs-network keys so "fresh start" stays a single
concept. Tests extend the existing `tests/examples/stubs/brain-js.ts` shim with
minimal `.train()` / `.toJSON()` so CI keeps avoiding the brain.js native
build.

**Tech Stack:** TypeScript (strict + `exactOptionalPropertyTypes`), vitest
(+ jsdom env), Vite for the demo build. brain.js as an optional peer. ESM with
`.js` extensions on relative imports.

**Design reference:** Design section approved in the 0.9.3 brainstorm (Q1(b),
Q2(b), Q3(a), Q4(a), Q5(a)). Scope decisions there are out of scope to revisit
here. Relies on `v1-comprehensive-plan.md:115–124` for the framing and on the
0.9.4 `Reasoner.reset()` harmonization shipping first (even though the brain.js
adapter opts out of reset, the cognition mode rebuilds on switcher selection
and we want the port contract landed before the demo exercises a second
round-trip of persisted adapter state).

---

## File Structure

### New files

- `tests/examples/learningMode.train.test.ts` — test suite covering button
  visibility under mode gating, train invocation, persistence, rehydration on
  fresh construction, reset-wipes-network.

### Modified files

- `tests/examples/stubs/brain-js.ts` — extend the stub with minimal `.train()`
  (records the last batch it received) and `.toJSON()` (returns a deterministic
  sentinel derived from recorded calls). Change `run()` from throwing to
  returning `[0.5]` so `construct()` is testable without the native peer.
- `examples/nurture-pet/index.html` — add `<button id="train-network"
hidden>Train</button>` inside the existing `#cognition-switcher` container.
- `examples/nurture-pet/src/cognitionSwitcher.ts` — in the `onChange` path,
  toggle the Train button visibility based on selected mode id (show only for
  `learning`). Attach the train click handler once at mount, not per-change.
  Expose the reasoner instance to the train handler via closure or a small
  internal setter (whichever matches the existing switcher's style — check
  before deciding).
- `examples/nurture-pet/src/cognition/learning.ts` — two changes:
  1. Before `network.fromJSON(networkJson)`, check
     `localStorage.getItem('agentonomous/<agentId>/brainjs-network')`; if
     present and parses, use that instead of the default asset.
  2. Rewrite `interpret()` to apply the `URGENCY_THRESHOLD` gate before falling
     back to `topCandidate()`.
- `examples/nurture-pet/src/ui.ts` — in the existing reset handler
  (`mountResetButton`), add a `localStorage.removeItem(...)` call for the
  brainjs-network key alongside the existing snapshot key removal.

### Deliberately untouched

- `examples/nurture-pet/src/cognition/learning.network.json` — the hand-authored
  default asset stays as-is. Trained state only lives in localStorage.
- Any file under `src/` — this is a demo-only PR. If execution uncovers a
  required library change, stop and treat it as a scope escape.

---

## Task 0: Prerequisites + cut topic branch

**Files:** none (git only).

- [ ] **Step 1: Confirm 0.9.4 is merged to `develop`.**

Run: `git log --oneline origin/develop --grep="reasoner.reset\|0.9.4" -5`
Expected: at least one commit referencing the 0.9.4 reset harmonization.
If none, stop and merge 0.9.4 first.

- [ ] **Step 2: Confirm clean tree + pull develop.**

Run: `git switch develop && git status && git pull --ff-only origin develop`
Expected: `nothing to commit, working tree clean` and a fast-forward (or
already up to date).

- [ ] **Step 3: Cut the topic branch.**

Run: `git switch -c feat/brainjs-training-persistence`

---

## Task 1: Extend the brain.js test stub

**Files:**

- Modify: `tests/examples/stubs/brain-js.ts`

- [ ] **Step 1: Replace the class body.**

Replace the current `NeuralNetwork` class (lines 25–32) with:

```ts
export class NeuralNetwork<In = unknown, Out = unknown> {
  #weights: unknown = null;
  #lastTrain: unknown = null;

  run(_input: In): Out {
    // Stable scalar makes urgency-gate tests deterministic without a real net.
    return [0.5] as unknown as Out;
  }

  fromJSON(json: unknown): this {
    this.#weights = json;
    return this;
  }

  toJSON(): unknown {
    return { stub: true, trainedFrom: this.#lastTrain, seededFrom: this.#weights };
  }

  train(pairs: unknown, _opts: unknown): void {
    this.#lastTrain = pairs;
  }
}
```

Update the surrounding JSDoc (lines 1–24) to reflect that the stub now covers
`run()` with a stable value and records `.train()` / `.toJSON()` for assertion.
Delete the sentence claiming `run()` throws.

- [ ] **Step 2: Typecheck.**

Run: `npm run typecheck`
Expected: no errors. Existing `cognitionSwitcher.test.ts` doesn't touch
`run()` / `train()` / `toJSON()`, so it's unaffected.

- [ ] **Step 3: Test suite still green.**

Run: `npm test`
Expected: all existing tests pass.

- [ ] **Step 4: Commit.**

```bash
git add tests/examples/stubs/brain-js.ts
git commit -m "test(demo): extend brain.js stub with train/toJSON + stable run

Prepares the stub for 0.9.3's training-persistence tests. run() now
returns a stable [0.5] so construct() and urgency-gate logic are
testable without the native peer. train() records the last pair batch;
toJSON() returns a deterministic sentinel. No behavior change for
existing tests."
```

---

## Task 2: Mount the Train button (mode-gated visibility)

**Files:**

- Create: `tests/examples/learningMode.train.test.ts`
- Modify: `examples/nurture-pet/index.html`
- Modify: `examples/nurture-pet/src/cognitionSwitcher.ts`

- [ ] **Step 1: Write the failing test.**

Create `tests/examples/learningMode.train.test.ts` with only the visibility
test for now. Mirror the fixture setup from `tests/examples/cognitionSwitcher.test.ts`
(DOM bootstrapping, agent construction, switcher mount).

```ts
import { describe, expect, it } from 'vitest';
// ...same imports as cognitionSwitcher.test.ts
// + whatever helper extracts the switcher-mount flow

describe('Train button visibility', () => {
  it('is hidden on initial mount (default mode is heuristic)', async () => {
    const { document } = await mountDemo();
    const btn = document.getElementById('train-network');
    expect(btn).not.toBeNull();
    expect(btn!.hasAttribute('hidden')).toBe(true);
  });

  it('becomes visible when the user selects learning mode', async () => {
    const { document, selectMode } = await mountDemo();
    await selectMode('learning');
    const btn = document.getElementById('train-network')!;
    expect(btn.hasAttribute('hidden')).toBe(false);
  });

  it('returns to hidden when the user selects a non-learning mode', async () => {
    const { document, selectMode } = await mountDemo();
    await selectMode('learning');
    await selectMode('heuristic');
    const btn = document.getElementById('train-network')!;
    expect(btn.hasAttribute('hidden')).toBe(true);
  });
});
```

> **Helper note:** if `mountDemo()` + `selectMode()` don't already exist as test
> helpers, extract them from `cognitionSwitcher.test.ts`'s beforeEach setup
> into a shared `tests/examples/helpers/mountDemo.ts` and import from there.
> Keep the extraction surgical — don't refactor unrelated test code.

- [ ] **Step 2: Run it; confirm failure.**

Run: `npm test -- learningMode.train`
Expected: `#train-network` element is null (not yet in DOM).

- [ ] **Step 3: Add the button to `index.html`.**

Inside the existing `<div id="cognition-switcher">` block (around lines
483–489 of `examples/nurture-pet/index.html`), append:

```html
<button id="train-network" type="button" hidden>Train</button>
```

Adjacent to the existing `<select id="cognition-mode-select">` and
`<span id="cognition-status">`. The `hidden` attribute is load-time default.

- [ ] **Step 4: Wire the mode-gate toggle in `cognitionSwitcher.ts`.**

In the `onChange` path of the switcher — where the new reasoner is assigned —
also toggle the Train button's `hidden` attribute:

```ts
const trainBtn = document.getElementById('train-network') as HTMLButtonElement | null;
if (trainBtn) {
  if (nextMode.id === 'learning') trainBtn.removeAttribute('hidden');
  else trainBtn.setAttribute('hidden', '');
}
```

Read the current `onChange` implementation first (`cognitionSwitcher.ts`
lines 93–122) and place the toggle at a natural seam — after the reasoner
assignment, before the status flash.

- [ ] **Step 5: Run the tests.**

Run: `npm test -- learningMode.train`
Expected: all three visibility tests pass.

- [ ] **Step 6: Commit.**

```bash
git add examples/nurture-pet/index.html examples/nurture-pet/src/cognitionSwitcher.ts tests/examples/learningMode.train.test.ts
git commit -m "feat(demo): mode-gated Train button for learning mode

Mounts <button id='train-network' hidden> inside #cognition-switcher.
Visibility toggles with the selected cognition mode — shown only when
'learning' is active. Click handler lands in the next commit.

Extracts the DOM-bootstrap helpers into tests/examples/helpers/mountDemo.ts
for reuse across the cognitionSwitcher + learningMode suites."
```

_(Drop the helper-extraction line if you didn't extract any — adjust the
message to match reality.)_

---

## Task 3: Train click handler — generate pairs + call `.train()` + persist

**Files:**

- Modify: `tests/examples/learningMode.train.test.ts`
- Modify: `examples/nurture-pet/src/cognitionSwitcher.ts`

- [ ] **Step 1: Add the failing tests.**

Append a new `describe('Train click handler', () => { ... })` block to the
existing test file:

```ts
describe('Train click handler', () => {
  it('invokes NeuralNetwork.train() with 30 synthetic pairs when clicked', async () => {
    const { document, selectMode, getStubNetwork } = await mountDemo();
    await selectMode('learning');
    const btn = document.getElementById('train-network') as HTMLButtonElement;

    btn.click();
    await waitForTrainingFlush(); // poll until button re-enables

    const pairs = getStubNetwork().lastTrainPairs();
    expect(pairs).toHaveLength(30);
    expect(pairs.every((p) => 'input' in p && 'output' in p)).toBe(true);
    expect(pairs.every((p) => typeof p.output.score === 'number')).toBe(true);
  });

  it('writes the trained network to localStorage under the agent-scoped key', async () => {
    const { document, selectMode, agentId } = await mountDemo();
    await selectMode('learning');
    const btn = document.getElementById('train-network') as HTMLButtonElement;

    btn.click();
    await waitForTrainingFlush();

    const raw = localStorage.getItem(`agentonomous/${agentId}/brainjs-network`);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.stub).toBe(true); // matches our extended stub's toJSON()
    expect(parsed.trainedFrom).toHaveLength(30);
  });

  it('disables the button and changes its text during training, then restores', async () => {
    const { document, selectMode } = await mountDemo();
    await selectMode('learning');
    const btn = document.getElementById('train-network') as HTMLButtonElement;

    const clickPromise = fireClickAndCapture(btn); // helper: reads btn state between click and await
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Training…');
    await clickPromise;

    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Train');
  });
});
```

- [ ] **Step 2: Run it; confirm failure.**

Run: `npm test -- learningMode.train`
Expected: the three new tests fail — no click handler wired yet.

- [ ] **Step 3: Implement the click handler in `cognitionSwitcher.ts`.**

In the switcher module, attach a one-time click listener on `#train-network`
at mount time (not per-mode-change). The handler needs access to the current
`BrainJsReasoner` instance — thread it through a closure or the existing
reasoner reference, whichever matches the switcher's current state management.

```ts
async function onTrainClick(
  btn: HTMLButtonElement,
  adapter: { getNetwork: () => { train: (p: unknown, o: unknown) => void; toJSON: () => unknown } },
  agentId: string,
  rng: () => number,
): Promise<void> {
  btn.disabled = true;
  const originalText = btn.textContent ?? 'Train';
  btn.textContent = 'Training…';

  try {
    const pairs = Array.from({ length: 30 }, () => {
      const needs = {
        hunger: rng(),
        cleanliness: rng(),
        happiness: rng(),
        energy: rng(),
        health: rng(),
      };
      const urgency = 1 - Math.min(...Object.values(needs));
      return { input: needs, output: { score: urgency } };
    });

    const network = adapter.getNetwork();
    network.train(pairs, { iterations: 100, errorThresh: 0.005 });

    localStorage.setItem(
      `agentonomous/${agentId}/brainjs-network`,
      JSON.stringify(network.toJSON()),
    );

    // Brief success flash via #cognition-status — 1500ms then reverts.
    flashStatus('Trained ✓', 1500);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
```

Wire the listener at switcher mount time. Use the demo's existing seeded RNG
(from `seed.ts`) so training pairs are reproducible under a fixed seed.

- [ ] **Step 4: Run the tests.**

Run: `npm test -- learningMode.train`
Expected: all train-click tests pass.

- [ ] **Step 5: Commit.**

```bash
git add examples/nurture-pet/src/cognitionSwitcher.ts tests/examples/learningMode.train.test.ts
git commit -m "feat(demo): wire Train button to generate pairs + persist network

Click handler generates 30 synthetic (needs → urgency) pairs from the
demo's seeded RNG, runs network.train() with 100 iterations, and
writes network.toJSON() to agentonomous/<agentId>/brainjs-network. Button
disables + shows 'Training…' during the synchronous train call and
reverts on completion. Status flash signals success."
```

---

## Task 4: Rehydrate from localStorage in `learning.ts`

**Files:**

- Modify: `tests/examples/learningMode.train.test.ts`
- Modify: `examples/nurture-pet/src/cognition/learning.ts`

- [ ] **Step 1: Add the failing tests.**

Append:

```ts
describe('learningMode.construct() hydration order', () => {
  it('loads from localStorage when the brainjs-network key is present', async () => {
    const agentId = 'test-pet';
    const savedNet = { stub: true, trainedFrom: 'fake-prior-training' };
    localStorage.setItem(`agentonomous/${agentId}/brainjs-network`, JSON.stringify(savedNet));

    const { getStubNetwork } = await mountDemo({ agentId });
    await selectMode('learning');

    // Verify fromJSON() was called with the localStorage payload, NOT the default asset.
    expect(getStubNetwork().lastFromJSON()).toEqual(savedNet);
  });

  it('falls back to the default learning.network.json when the key is absent', async () => {
    const agentId = 'test-pet';
    localStorage.removeItem(`agentonomous/${agentId}/brainjs-network`);

    const { getStubNetwork } = await mountDemo({ agentId });
    await selectMode('learning');

    const loaded = getStubNetwork().lastFromJSON() as { type?: string; sizes?: number[] };
    // The default asset has sizes: [5, 1]. (See learning.network.json.)
    expect(loaded.sizes).toEqual([5, 1]);
  });
});
```

> **Stub helper addition:** in Task 1's stub, add a `lastFromJSON()`
> inspection getter if it's not already on the exported shape. Surgical
> extension — keep the stub tight.

- [ ] **Step 2: Run it; confirm failure.**

Run: `npm test -- learningMode.train`
Expected: the hydration-from-localStorage test fails — `construct()` currently
always loads from the default asset.

- [ ] **Step 3: Implement hydration in `learning.ts`.**

Replace the `construct()` body in `examples/nurture-pet/src/cognition/learning.ts`
around the `network.fromJSON(networkJson)` call (line 51):

```ts
const Net = NeuralNetwork as new () => {
  fromJSON: (json: unknown) => unknown;
  run: (input: unknown) => unknown;
};
const network = new Net();

const key = `agentonomous/${agentId}/brainjs-network`;
const persisted = localStorage.getItem(key);
let seed: unknown = networkJson;
if (persisted !== null) {
  try {
    seed = JSON.parse(persisted);
  } catch {
    // Corrupt value — fall back to default. No user-visible action needed.
    seed = networkJson;
  }
}
network.fromJSON(seed);
```

Thread `agentId` into `construct()` — either via the `CognitionModeSpec`'s
signature (if that's how other modes get it) or via a module-scoped setter
called from `main.ts`. **Check the existing signature before changing it** —
if `construct()` doesn't receive `agentId`, the smallest change is a
`setAgentId(id)` export on this module called once from `main.ts` after the
agent is created. Do not widen `CognitionModeSpec` unless every mode needs it.

- [ ] **Step 4: Run the tests.**

Run: `npm test -- learningMode.train`
Expected: both hydration tests pass.

- [ ] **Step 5: Commit.**

```bash
git add examples/nurture-pet/src/cognition/learning.ts tests/examples/stubs/brain-js.ts tests/examples/learningMode.train.test.ts
git commit -m "feat(demo): hydrate learning-mode network from localStorage

construct() checks agentonomous/<agentId>/brainjs-network first and
falls back to the learning.network.json default asset when the key is
absent or unparseable. Corrupt stored values silently revert to default
— no user-visible error; the Train button regenerates valid state."
```

---

## Task 5: Reset wiring — wipe the brainjs-network key too

**Files:**

- Modify: `tests/examples/learningMode.train.test.ts`
- Modify: `examples/nurture-pet/src/ui.ts`

- [ ] **Step 1: Add the failing test.**

Append:

```ts
describe('Reset button clears trained network', () => {
  it('removes agentonomous/<agentId>/brainjs-network when Reset is clicked', async () => {
    const agentId = 'test-pet';
    localStorage.setItem(
      `agentonomous/${agentId}/brainjs-network`,
      JSON.stringify({ stub: true, trainedFrom: 'prior' }),
    );

    const { document, confirmReset } = await mountDemo({ agentId });
    const resetBtn = document.getElementById('reset-button') as HTMLButtonElement;

    resetBtn.click();
    await confirmReset();

    expect(localStorage.getItem(`agentonomous/${agentId}/brainjs-network`)).toBeNull();
  });
});
```

> **Helper note:** Reset is confirm-gated — `confirmReset()` should auto-accept
> the confirmation modal. Look at how `cognitionSwitcher.test.ts` or other
> existing tests handle the confirm flow before writing a new helper.

- [ ] **Step 2: Run it; confirm failure.**

Run: `npm test -- learningMode.train`
Expected: the brainjs-network key is still present after reset.

- [ ] **Step 3: Add the cleanup line in `ui.ts`.**

In `mountResetButton` (or wherever the existing reset handler lives — search
`ui.ts` for `removeItem` to find the adjacent snapshot-cleanup call), add:

```ts
localStorage.removeItem(`agentonomous/${agentId}/brainjs-network`);
```

Place it immediately after the existing snapshot-key removal line so the two
cleanups are visually grouped.

- [ ] **Step 4: Run the test.**

Run: `npm test -- learningMode.train`
Expected: all reset tests pass.

- [ ] **Step 5: Commit.**

```bash
git add examples/nurture-pet/src/ui.ts tests/examples/learningMode.train.test.ts
git commit -m "feat(demo): Reset also wipes the trained brainjs-network

mountResetButton now removes agentonomous/<agentId>/brainjs-network
alongside the agent snapshot key. Reset stays a single 'fresh start'
concept — next learning-mode construct() falls back to the default
network asset."
```

---

## Task 6: `interpret()` urgency gate (behavioral change)

**Files:**

- Modify: `examples/nurture-pet/src/cognition/learning.ts`

> **No new unit tests** for this task: the stub's `run()` returns a stable
> `[0.5]`, and the urgency threshold is a constant. Any unit assertion
> collapses to either "always idles" or "never idles" depending on threshold
> choice — neither tests anything meaningful. Behavioral verification is a
> manual smoke in Task 7.

- [ ] **Step 1: Add the threshold constant and rewrite `interpret()`.**

Near the top of `learning.ts`, add:

```ts
const URGENCY_THRESHOLD = 0.35;
```

Replace the existing `interpret` function inside `construct()`:

```ts
interpret: (output, _ctx, helpers) => {
  const urgency = Array.isArray(output)
    ? (output[0] as number)
    : ((output as { score?: number }).score ?? 0);
  if (urgency < URGENCY_THRESHOLD) return null;
  const top = helpers.topCandidate();
  return top ? top.intention : null;
},
```

Update the module-level JSDoc (lines 5–13) to reflect the change: drop the
sentence saying the network's output is ignored; replace with a sentence
documenting the urgency gate and that `URGENCY_THRESHOLD = 0.35` was picked
empirically to produce a visible idle rate given the default network.

- [ ] **Step 2: Typecheck + full test.**

Run: `npm run verify`
Expected: all stages green.

- [ ] **Step 3: Commit.**

```bash
git add examples/nurture-pet/src/cognition/learning.ts
git commit -m "feat(demo): urgency-gate interpret() in learning mode

Network scalar output is now wired into intention selection as an
urgency gate: the pet idles this tick when the network's score falls
below URGENCY_THRESHOLD (0.35). Visible demo effect — trained and
untrained networks produce different idle rates, making training
observable in the trace view. Threshold is empirical; may be tuned
during manual smoke."
```

---

## Task 7: Manual smoke test

**Files:** none (manual verification).

- [ ] **Step 1: Build the library.**

Run: `npm run build`
Expected: clean `dist/` output.

- [ ] **Step 2: Start the demo.**

Run: `npm run demo:dev`
Expected: Vite dev server at `http://localhost:5173`.

- [ ] **Step 3: Verify initial state.**

- Open the demo in a fresh private window (clean localStorage).
- Switch to Learning mode. Train button appears.
- Watch the trace view for ~15 seconds. Note the idle-tick frequency
  (how often "selected: null" appears).

- [ ] **Step 4: Train and verify persistence.**

- Click Train. Button disables + shows "Training…" + brief "Trained ✓" flash.
- Open DevTools → Application → Local Storage.
- Verify `agentonomous/<agentId>/brainjs-network` key exists with
  a JSON value (start of `{"type":"NeuralNetwork"` or similar real
  brain.js output — NOT the stub sentinel since this is the real peer).
- Watch the trace view for ~15 seconds again. Idle-tick frequency should be
  noticeably different from pre-training.

- [ ] **Step 5: Verify rehydration on reload.**

- Hard reload (Ctrl+Shift+R).
- Switch back to Learning mode (the switcher resets to heuristic on reload).
- Trace view should match the post-training state from Step 4, NOT the
  pre-training default.

- [ ] **Step 6: Verify Reset wipes.**

- Click Reset. Confirm the dialog.
- Check DevTools localStorage: `agentonomous/<agentId>/brainjs-network` is
  gone. Agent snapshot key is also gone.
- Switch to Learning mode. Trace should match the pre-training baseline
  from Step 3.

- [ ] **Step 7: Tune threshold if needed.**

If Steps 3 and 4 produce indistinguishable idle rates, either:

- Raise `URGENCY_THRESHOLD` until baseline produces clear idle ticks, or
- Adjust the training label function so post-training urgency systematically
  shifts.

If tuning is needed, add a commit:

```bash
git add examples/nurture-pet/src/cognition/learning.ts
git commit -m "tune(demo): URGENCY_THRESHOLD for visible pre/post-train divergence"
```

---

## Task 8: Verify, PR, cleanup

**Files:** none.

- [ ] **Step 1: Full pre-PR gate.**

Run: `npm run verify`
Expected: `format:check`, `lint`, `typecheck`, `test`, `build` all green.

- [ ] **Step 2: Push and open PR.**

```bash
git push -u origin feat/brainjs-training-persistence
gh pr create --base develop --title "feat(demo): 0.9.3 brain.js training persistence" --body "$(cat <<'EOF'
## Summary
- Mode-gated Train button inside #cognition-switcher — visible only when Learning mode is active.
- Click handler generates 30 synthetic (needs → urgency) pairs from the demo's seeded RNG and runs `network.train()` for 100 iterations on the main thread.
- Trained network persists to `agentonomous/<agentId>/brainjs-network` (parallel to existing seed/speed keys, not inside the agent snapshot).
- `learning.ts` rehydrates from that key on `construct()`; falls back to the bundled `learning.network.json` default when absent.
- `interpret()` now wires the network's scalar output into an urgency gate — pet idles this tick below `URGENCY_THRESHOLD` (0.35). Trained state is observably different from default in the trace view.
- Reset wipes both the agent snapshot and the brainjs-network key.
- No library changes.
- Tests extend the existing brain.js stub with minimal `.train()`/`.toJSON()`/stable `.run()` so CI keeps avoiding the native peer.

Depends on 0.9.4 reset-harmonization being on `develop`.

## Test plan
- [ ] `npm run verify` green locally (format, lint, typecheck, test, build).
- [ ] New test file `tests/examples/learningMode.train.test.ts` covers button visibility, click → train → persist, hydration from localStorage, reset-wipes-network.
- [ ] Manual smoke in Chrome verifies persistence across reload and visible pre/post-training trace divergence.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: After merge — local cleanup.**

```bash
git switch develop
git pull origin develop
git branch -d feat/brainjs-training-persistence
git fetch --prune origin
```

Delete the remote branch via the merged-PR UI if the repo doesn't auto-delete.

---

## Risks & escape hatches

| Risk                                                                             | Mitigation                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URGENCY_THRESHOLD tuning doesn't produce visible divergence                      | Task 7 step 7 bakes tuning into the smoke flow. Adjust threshold or label function.                                                                                          |
| brain.js `.train()` blocks noticeably on slower hardware                         | Iteration count is bounded (100) on a bounded dataset (30 pairs). If reports surface post-merge, open a follow-up for the worker path (deferred in Q4(b)).                   |
| Existing `cognitionSwitcher.test.ts` breaks when the stub `run()` stops throwing | That test never calls `construct()` (per its setup code) so `run()` isn't exercised. Regression would mean the test was silently relying on the throw — treat as a real bug. |
| Agent-ID threading to `construct()` requires widening `CognitionModeSpec`        | Task 4 Step 3 escape: use a module-scoped `setAgentId()` on `learning.ts` called from `main.ts` instead of changing the shared spec.                                         |
| Vite's `vite:import-analysis` plugin chokes on the new localStorage path         | Not expected — localStorage is a runtime concern, not an import-graph concern. If seen, surface via `npm run demo:dev` failure and treat as unrelated.                       |

## Out of scope (hard — if any of these appears during execution, stop and defer)

- Any change under `src/` (library code). Demo-only PR.
- Training-from-play observation buffer (deferred per Q1(c)).
- Web worker training (deferred per Q4(b)).
- Forget / cross-pet persistence (deferred per Q3(b)/(c)).
- Wiring `AgentSnapshot.beliefs` (out of scope per 0.9.4 Q3(a)).
- Replacing or regenerating `learning.network.json`. The default asset stays as-is.
- Refactoring the existing cognition switcher beyond the new toggle + listener attachment.
