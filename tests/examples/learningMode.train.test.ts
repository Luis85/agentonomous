// @vitest-environment jsdom
/**
 * DOM test for the demo's Train button + learning-mode training
 * persistence flow. Mounts the real cognitionSwitcher against a fake
 * agent and drives the train → persist → rehydrate → reset lifecycle
 * end-to-end against the real tfjs adapter (CPU backend).
 */
import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { mountCognitionSwitcher } from '../../examples/nurture-pet/src/cognitionSwitcher.js';
import { setLearningAgentId } from '../../examples/nurture-pet/src/cognition/learning.js';
import { mountResetButton } from '../../examples/nurture-pet/src/ui.js';

interface FakeAgent {
  setReasoner: Mock<(r: unknown) => void>;
  setLearner: Mock<(l: unknown) => void>;
  getState: () => { needs: Record<string, number> };
  identity: { id: string; name: string };
  rng: {
    next: () => number;
    int: (min: number, max: number) => number;
    chance: (p: number) => boolean;
    pick: <T>(items: readonly T[]) => T;
  };
}

beforeAll(async () => {
  await tf.setBackend('cpu');
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
  setLearningAgentId(agentId);
  const fakeAgent: FakeAgent = {
    setReasoner: vi.fn(),
    setLearner: vi.fn(),
    getState: () => ({
      needs: { hunger: 0.5, cleanliness: 0.5, happiness: 0.5, energy: 0.5, health: 0.5 },
    }),
    identity: { id: agentId, name: agentId },
    rng: makeFakeRng(),
  };
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
      weightsShapes?: unknown[];
    };
    expect(parsed.version).toBe(1);
    expect(typeof parsed.weights).toBe('string');
    expect(parsed.weights!.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.weightsShapes)).toBe(true);
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

  it('labels SkillCompleted outcomes as [1] (positive sample)', async () => {
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

  it('labels SkillFailed outcomes as [0] (negative sample)', async () => {
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
    expect(learner.bufferedCount()).toBe(1);
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
