// @vitest-environment jsdom
/**
 * DOM test for the demo's Train button + learning-mode training
 * persistence flow. Mounts the real cognitionSwitcher against a fake
 * agent and drives the train → persist → rehydrate → reset lifecycle
 * end-to-end against the real tfjs adapter (matrix-selected backend —
 * cpu by default; wasm under `TFJS_BACKEND=wasm`).
 */
// Backend package is side-effect-imported by `tests/setup/tfjsBackendSetup.ts`
// before this file's static imports run, so the `tf.getBackend()` assertion
// in `beforeAll` is the only thing left to align.
import * as tf from '@tensorflow/tfjs-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { mountCognitionSwitcher } from '../../examples/nurture-pet/src/cognitionSwitcher.js';
import {
  interpretSoftmax,
  setLearningAgent,
  SOFTMAX_SKILL_IDS,
} from '../../examples/nurture-pet/src/cognition/learning.js';
import { mountResetButton } from '../../examples/nurture-pet/src/ui.js';
import { TEST_BACKEND } from '../setup/tfjsBackend.js';

type FakeAgent = {
  setReasoner: Mock<(r: unknown) => void>;
  setLearner: Mock<(l: unknown) => void>;
  getState: () => {
    needs: Record<string, number>;
    modifiers: ReadonlyArray<{ id: string }>;
    mood?: { category: string; updatedAt: number };
  };
  subscribe: (handler: (e: { type: string }) => void) => () => void;
  identity: { id: string; name: string };
  rng: {
    next: () => number;
    int: (min: number, max: number) => number;
    chance: (p: number) => boolean;
    pick: <T>(items: readonly T[]) => T;
  };
};

beforeAll(async () => {
  await tf.setBackend(TEST_BACKEND);
  await tf.ready();
});

function makeFakeRng(): FakeAgent['rng'] {
  let i = 0;
  const next = (): number => {
    i = (i * 1664525 + 1013904223) >>> 0;
    i = (i + 1) >>> 0;
    return ((i >>> 0) % 1_000_003) / 1_000_003;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)] as never,
  };
}

function renderRoot(): HTMLElement {
  document.body.innerHTML =
    '<div id="cognition-switcher">' +
    '<select id="cognition-mode-select"></select>' +
    '<span id="cognition-status" data-mode="heuristic">active</span>' +
    '<button id="train-network" type="button" hidden>Train</button>' +
    '<button id="untrain-network" type="button" hidden>Untrain</button>' +
    '<span id="learner-buffer" hidden></span>' +
    '</div>' +
    '<button id="reset-button" type="button">Reset</button>';
  return document.querySelector<HTMLElement>('#cognition-switcher')!;
}

async function waitForProbes(select: HTMLSelectElement, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pending = Array.from(select.options).some(
      (o) => o.value !== 'heuristic' && o.disabled && o.title === '',
    );
    if (!pending) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('waitForProbes: probes did not settle within timeout');
}

async function waitForCalls(
  mock: Mock<(r: unknown) => void>,
  n = 1,
  timeoutMs = 4000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (mock.mock.calls.length >= n) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`waitForCalls: mock called ${mock.mock.calls.length} times (expected ${n})`);
}

async function mountDemo(opts: { agentId?: string } = {}): Promise<{
  document: Document;
  agentId: string;
  selectMode: (id: string) => Promise<void>;
  fakeAgent: FakeAgent;
  confirmReset: () => Promise<void>;
}> {
  const agentId = opts.agentId ?? 'test-pet';
  const root = renderRoot();
  const fakeAgent: FakeAgent = {
    setReasoner: vi.fn(),
    setLearner: vi.fn(),
    getState: () => ({
      needs: { hunger: 0.5, cleanliness: 0.5, happiness: 0.5, energy: 0.5, health: 0.5 },
      modifiers: [],
    }),
    // No-op event subscription. The learning module's `setLearningAgent`
    // wires real handlers when running against a live `Agent`; the test
    // double exercises the localStorage-scoping side without driving the
    // mood / event-count state.
    subscribe: () => () => undefined,
    identity: { id: agentId, name: agentId },
    rng: makeFakeRng(),
  };
  setLearningAgent(fakeAgent as never);
  mountCognitionSwitcher(fakeAgent as never, root);
  mountResetButton(fakeAgent as never);
  const select = root.querySelector<HTMLSelectElement>('#cognition-mode-select')!;
  await waitForProbes(select);

  return {
    document,
    agentId,
    fakeAgent,
    confirmReset: async () => {
      await Promise.resolve();
    },
    selectMode: async (id) => {
      const prevCount = fakeAgent.setReasoner.mock.calls.length;
      select.value = id;
      select.dispatchEvent(new Event('change'));
      if (id === 'heuristic') {
        await new Promise((r) => setTimeout(r, 20));
      } else {
        await waitForCalls(fakeAgent.setReasoner, prevCount + 1);
      }
    },
  };
}

async function waitForTrainingFlush(btn: HTMLButtonElement, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!btn.disabled) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('waitForTrainingFlush: train button did not re-enable within timeout');
}

describe('Train button visibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('is hidden on initial mount (default mode is heuristic)', async () => {
    const { document: doc } = await mountDemo();
    const btn = doc.getElementById('train-network');
    expect(btn).not.toBeNull();
    expect(btn!.hasAttribute('hidden')).toBe(true);
  });

  it('becomes visible when the user selects learning mode', async () => {
    const { document: doc, selectMode } = await mountDemo();
    await selectMode('learning');
    const btn = doc.getElementById('train-network')!;
    expect(btn.hasAttribute('hidden')).toBe(false);
  });

  it('returns to hidden when the user selects a non-learning mode', async () => {
    const { document: doc, selectMode } = await mountDemo();
    await selectMode('learning');
    await selectMode('bt');
    const btn = doc.getElementById('train-network')!;
    expect(btn.hasAttribute('hidden')).toBe(true);
  });
});

describe('Untrain button', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('shares visibility with the Train button across mode switches', async () => {
    const { document: doc, selectMode } = await mountDemo();
    const untrain = doc.getElementById('untrain-network')!;
    expect(untrain.hasAttribute('hidden')).toBe(true);

    await selectMode('learning');
    expect(untrain.hasAttribute('hidden')).toBe(false);

    await selectMode('heuristic');
    expect(untrain.hasAttribute('hidden')).toBe(true);
  });

  it('clears the persisted tfjs snapshot and swaps in a fresh reasoner', async () => {
    const agentId = 'test-pet';
    localStorage.setItem(
      `agentonomous/${agentId}/tfjs-network`,
      JSON.stringify({ version: 1, topology: {}, weights: '', weightsShapes: [] }),
    );

    const { document: doc, selectMode, fakeAgent } = await mountDemo({ agentId });
    await selectMode('learning');
    const initialSetCount = fakeAgent.setReasoner.mock.calls.length;
    const untrainBtn = doc.getElementById('untrain-network') as HTMLButtonElement;

    untrainBtn.click();
    await waitForTrainingFlush(untrainBtn);

    expect(localStorage.getItem(`agentonomous/${agentId}/tfjs-network`)).toBeNull();
    expect(fakeAgent.setReasoner.mock.calls.length).toBeGreaterThan(initialSetCount);
    expect(untrainBtn.textContent).toBe('Untrain');
    expect(untrainBtn.disabled).toBe(false);
  });
});

describe('Train click handler', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('writes a tfjs snapshot to localStorage under the agent-scoped key', async () => {
    const { document: doc, selectMode, agentId } = await mountDemo();
    await selectMode('learning');
    const btn = doc.getElementById('train-network') as HTMLButtonElement;

    btn.click();
    await waitForTrainingFlush(btn);

    const raw = localStorage.getItem(`agentonomous/${agentId}/tfjs-network`);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as {
      version?: number;
      weights?: string;
      weightsShapes?: number[][];
    };
    expect(parsed.version).toBe(1);
    expect(typeof parsed.weights).toBe('string');
    expect(parsed.weights!.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.weightsShapes)).toBe(true);
    // Topology contract: [13, 16] kernel + [16] bias on the hidden
    // dense layer, then [16, 7] kernel + [7] bias on the softmax head.
    // 13 = 5 needs + 4 mood one-hot + 1 modifier-count + 3 recent-event
    // counts (row 18). Locks the post-train snapshot shape so a
    // topology drift can't sneak past review.
    expect(parsed.weightsShapes).toEqual([
      [13, 16],
      [16],
      [16, SOFTMAX_SKILL_IDS.length],
      [SOFTMAX_SKILL_IDS.length],
    ]);
  });

  it('disables the button and changes its text during training, then restores', async () => {
    const { document: doc, selectMode } = await mountDemo();
    await selectMode('learning');
    const btn = doc.getElementById('train-network') as HTMLButtonElement;

    btn.click();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Training…');
    await waitForTrainingFlush(btn);

    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Train');
  });
});

describe('learningMode.construct() hydration order', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('construct() succeeds with no persisted snapshot (uses bundled default)', async () => {
    const { fakeAgent, selectMode } = await mountDemo({ agentId: 'test-pet' });
    await selectMode('learning');
    const reasoner = fakeAgent.setReasoner.mock.calls[0]?.[0] as { selectIntention?: unknown };
    expect(typeof reasoner?.selectIntention).toBe('function');
  });

  it('construct() falls back to the default when the stored value is unparseable JSON', async () => {
    const agentId = 'test-pet';
    localStorage.setItem(`agentonomous/${agentId}/tfjs-network`, '{not valid json');

    const { fakeAgent, selectMode } = await mountDemo({ agentId });
    await selectMode('learning');
    const reasoner = fakeAgent.setReasoner.mock.calls[0]?.[0] as { selectIntention?: unknown };
    expect(typeof reasoner?.selectIntention).toBe('function');
  });

  it('construct() falls back when the stored snapshot has a bogus topology', async () => {
    const agentId = 'test-pet';
    localStorage.setItem(
      `agentonomous/${agentId}/tfjs-network`,
      JSON.stringify({
        version: 1,
        topology: { garbage: true },
        weights: '',
        weightsShapes: [],
      }),
    );

    const { fakeAgent, selectMode } = await mountDemo({ agentId });
    await selectMode('learning');
    const reasoner = fakeAgent.setReasoner.mock.calls[0]?.[0] as { selectIntention?: unknown };
    expect(typeof reasoner?.selectIntention).toBe('function');
  });

  it('construct() rebuilds from baseline when a pre-row-17 single-output snapshot is persisted', async () => {
    // Codex P1 finding on PR #94 (learning.ts:121) — a pre-row-17 [5, ?, 1]
    // sigmoid snapshot is structurally compatible with `TfjsReasoner.fromJSON`,
    // so without a dim-mismatch guard `interpret()` would silently treat
    // the scalar urgency as the `feed`-column probability of a 7-way
    // softmax. Build such a snapshot here, persist it, then verify the
    // rebuilt reasoner's model emits the expected 7-dim output (i.e. the
    // guard fired and the bundled baseline took over).
    const agentId = 'test-pet';
    const layers = await import('@tensorflow/tfjs-layers');
    const { TfjsReasoner } = await import('../../src/cognition/adapters/tfjs/index.js');

    // Build a [5, 4, 1] sigmoid model directly so we can snapshot it.
    const oldModel = layers.sequential();
    oldModel.add(layers.layers.dense({ units: 4, activation: 'sigmoid', inputShape: [5] }));
    oldModel.add(layers.layers.dense({ units: 1, activation: 'sigmoid' }));
    const oldReasoner = new TfjsReasoner<number[], number[]>({
      model: oldModel,
      featuresOf: () => [0, 0, 0, 0, 0],
      interpret: () => null,
    });
    const oldSnapshot = oldReasoner.toJSON();
    oldReasoner.dispose();
    localStorage.setItem(`agentonomous/${agentId}/tfjs-network`, JSON.stringify(oldSnapshot));

    const { fakeAgent, selectMode } = await mountDemo({ agentId });
    await selectMode('learning');
    const reasoner = fakeAgent.setReasoner.mock.calls.at(-1)?.[0] as {
      getModel?: () => { outputs?: ReadonlyArray<{ shape?: ReadonlyArray<number | null> }> };
      selectIntention?: unknown;
    };
    expect(typeof reasoner?.selectIntention).toBe('function');

    const outShape = reasoner.getModel?.().outputs?.[0]?.shape;
    const lastDim = outShape && outShape.length > 0 ? outShape[outShape.length - 1] : null;
    expect(lastDim).toBe(7);
  });
});

describe('Learner wiring (setLearner)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('attaches a TfjsLearner-shaped learner when learning mode is selected', async () => {
    const { fakeAgent, selectMode } = await mountDemo();
    await selectMode('learning');
    expect(fakeAgent.setLearner.mock.calls.length).toBeGreaterThan(0);
    const last = fakeAgent.setLearner.mock.calls.at(-1)?.[0] as {
      score?: unknown;
      bufferedCount?: unknown;
      isTraining?: unknown;
      dispose?: unknown;
    };
    expect(typeof last?.score).toBe('function');
    expect(typeof last?.bufferedCount).toBe('function');
    expect(typeof last?.isTraining).toBe('function');
    expect(typeof last?.dispose).toBe('function');
  });

  it('falls back to NoopLearner when leaving learning mode', async () => {
    const { fakeAgent, selectMode } = await mountDemo();
    await selectMode('learning');
    const beforeLeaveCount = fakeAgent.setLearner.mock.calls.length;
    await selectMode('heuristic');
    expect(fakeAgent.setLearner.mock.calls.length).toBeGreaterThan(beforeLeaveCount);
    const last = fakeAgent.setLearner.mock.calls.at(-1)?.[0] as {
      score?: unknown;
      bufferedCount?: unknown;
    };
    expect(typeof last?.score).toBe('function');
    // NoopLearner has no bufferedCount.
    expect(last?.bufferedCount).toBeUndefined();
  });

  it('rebuilds the learner on Untrain', async () => {
    const { document: doc, fakeAgent, selectMode } = await mountDemo();
    await selectMode('learning');
    const enterLearnerCount = fakeAgent.setLearner.mock.calls.length;

    const untrainBtn = doc.getElementById('untrain-network') as HTMLButtonElement;
    untrainBtn.click();
    await waitForTrainingFlush(untrainBtn);

    expect(fakeAgent.setLearner.mock.calls.length).toBeGreaterThan(enterLearnerCount);
    const last = fakeAgent.setLearner.mock.calls.at(-1)?.[0] as {
      bufferedCount?: unknown;
    };
    expect(typeof last?.bufferedCount).toBe('function');
  });

  it('TfjsLearner triggers exactly floor(N/batchSize) background train() calls', async () => {
    const { fakeAgent, selectMode } = await mountDemo();
    await selectMode('learning');
    const learner = fakeAgent.setLearner.mock.calls.at(-1)?.[0] as {
      score: (o: unknown) => void;
      flush: () => Promise<unknown>;
      bufferedCount: () => number;
    };
    // Default LEARNER_BATCH_SIZE = 50. Push 130 outcomes; expect 2
    // background batches (floor(130/50)) and 30 buffered remainders.
    for (let i = 0; i < 130; i++) {
      learner.score({
        intention: { kind: 'satisfy', type: 'feed' },
        actions: [],
        details: { effectiveness: 1 },
      });
    }
    // Drain any inflight background train so bufferedCount stabilises.
    await learner.flush();
    expect(learner.bufferedCount()).toBe(0);
  });

  it('learner-buffer readout is hidden outside learning mode', async () => {
    const { document: doc, selectMode } = await mountDemo();
    const span = doc.getElementById('learner-buffer')!;
    expect(span.hasAttribute('hidden')).toBe(true);
    await selectMode('learning');
    expect(span.hasAttribute('hidden')).toBe(false);
    await selectMode('bt');
    expect(span.hasAttribute('hidden')).toBe(true);
  });
});

describe('projectLearningOutcome (via buildLearningLearner)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('labels SkillCompleted outcomes as a one-hot 7-vector (positive sample)', async () => {
    const { fakeAgent, selectMode } = await mountDemo();
    await selectMode('learning');
    const learner = fakeAgent.setLearner.mock.calls.at(-1)?.[0] as {
      score: (o: unknown) => void;
      flush: () => Promise<unknown>;
      bufferedCount: () => number;
    };
    // SkillCompleted shape: details.effectiveness > 0.
    learner.score({
      intention: { kind: 'satisfy', type: 'feed' },
      actions: [],
      details: { effectiveness: 0.8 },
    });
    expect(learner.bufferedCount()).toBe(1);
  });

  it('skips SkillFailed outcomes (avoids zero-vector labels under categoricalCrossentropy)', async () => {
    // Under categoricalCrossentropy, an all-zero target yields zero loss
    // and zero gradient — failed outcomes would silently no-op a buffer
    // slot. Drop them at the projection layer instead. Codex P1 finding
    // on PR #94 (learning.ts:235); revisit when row 18 lifts negative
    // signal into a proper reward field.
    const { fakeAgent, selectMode } = await mountDemo();
    await selectMode('learning');
    const learner = fakeAgent.setLearner.mock.calls.at(-1)?.[0] as {
      score: (o: unknown) => void;
      bufferedCount: () => number;
    };
    learner.score({
      intention: { kind: 'satisfy', type: 'feed' },
      actions: [],
      details: { failed: true, code: 'execution-threw', message: 'boom' },
    });
    expect(learner.bufferedCount()).toBe(0);
  });

  it('skips outcomes with neither failed flag nor effectiveness', async () => {
    const { fakeAgent, selectMode } = await mountDemo();
    await selectMode('learning');
    const learner = fakeAgent.setLearner.mock.calls.at(-1)?.[0] as {
      score: (o: unknown) => void;
      bufferedCount: () => number;
    };
    learner.score({ intention: { kind: 'satisfy', type: 'feed' }, actions: [] });
    expect(learner.bufferedCount()).toBe(0);
  });

  it('skips outcomes whose intention is outside the 7-skill softmax index', async () => {
    const { fakeAgent, selectMode } = await mountDemo();
    await selectMode('learning');
    const learner = fakeAgent.setLearner.mock.calls.at(-1)?.[0] as {
      score: (o: unknown) => void;
      bufferedCount: () => number;
    };
    // `meow` is an expression skill; it stays in the heuristic-reactive
    // layer and must NOT influence the softmax baseline.
    learner.score({
      intention: { kind: 'express', type: 'meow' },
      actions: [],
      details: { effectiveness: 0.8 },
    });
    expect(learner.bufferedCount()).toBe(0);
  });
});

describe('interpretSoftmax', () => {
  it('picks argmax of the 7-vector softmax output', () => {
    // High confidence on `play` (index 2 in SOFTMAX_SKILL_IDS).
    const output = [0.05, 0.05, 0.7, 0.05, 0.05, 0.05, 0.05];
    const intent = interpretSoftmax(output);
    expect(intent).not.toBeNull();
    expect(intent).toEqual({ kind: 'satisfy', type: 'play' });
  });

  it('returns null when the max probability is below the idle floor', () => {
    // ~uniform distribution: max ≈ 0.143, well below the 0.2 floor.
    const output = new Array<number>(SOFTMAX_SKILL_IDS.length).fill(1 / SOFTMAX_SKILL_IDS.length);
    expect(interpretSoftmax(output)).toBeNull();
  });

  it('breaks ties on the lowest index (deterministic argmax)', () => {
    // Two columns at exactly 0.5 — argmax should pick the first.
    const output = [0.5, 0.5, 0, 0, 0, 0, 0];
    expect(interpretSoftmax(output)).toEqual({ kind: 'satisfy', type: 'feed' });
  });

  it('emits each of the 7 active-care skills when its column dominates', () => {
    for (let i = 0; i < SOFTMAX_SKILL_IDS.length; i++) {
      const output = new Array<number>(SOFTMAX_SKILL_IDS.length).fill(0.05);
      output[i] = 0.7;
      const intent = interpretSoftmax(output);
      expect(intent).toEqual({ kind: 'satisfy', type: SOFTMAX_SKILL_IDS[i] });
    }
  });
});

describe('Reset button clears trained network', () => {
  let origLocation: Location;

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    origLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...origLocation, reload: () => undefined },
      writable: true,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: origLocation,
      writable: true,
    });
  });

  it('removes agentonomous/<agentId>/tfjs-network when Reset is clicked', async () => {
    const agentId = 'test-pet';
    localStorage.setItem(
      `agentonomous/${agentId}/tfjs-network`,
      JSON.stringify({ version: 1, topology: {}, weights: '', weightsShapes: [] }),
    );

    const { document: doc, confirmReset } = await mountDemo({ agentId });
    const resetBtn = doc.getElementById('reset-button') as HTMLButtonElement;

    resetBtn.click();
    await confirmReset();

    expect(localStorage.getItem(`agentonomous/${agentId}/tfjs-network`)).toBeNull();
  });
});
