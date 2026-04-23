// @vitest-environment jsdom
/**
 * DOM test for the demo's Train button + learning-mode training
 * persistence flow. Mounts the real cognitionSwitcher against a fake
 * agent (same stance as `cognitionSwitcher.test.ts`) and drives the
 * train → persist → rehydrate → reset lifecycle end-to-end against
 * the aliased brain.js stub.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { mountCognitionSwitcher } from '../../examples/nurture-pet/src/cognitionSwitcher.js';
import { setLearningAgentId } from '../../examples/nurture-pet/src/cognition/learning.js';
import { mountResetButton } from '../../examples/nurture-pet/src/ui.js';
import { NeuralNetwork as StubNeuralNetwork } from './stubs/brain-js.js';

interface FakeAgent {
  setReasoner: Mock<(r: unknown) => void>;
  identity: { id: string; name: string };
  rng: {
    next: () => number;
    int: (min: number, max: number) => number;
    chance: (p: number) => boolean;
    pick: <T>(items: readonly T[]) => T;
  };
}

function makeFakeRng(): FakeAgent['rng'] {
  let i = 0;
  // Stable, hash-based pseudo-random sequence — tests must not depend
  // on Math.random.
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
    '</div>' +
    '<button id="reset-button" type="button">Reset</button>';
  return document.querySelector<HTMLElement>('#cognition-switcher')!;
}

async function waitForProbes(select: HTMLSelectElement, timeoutMs = 2000): Promise<void> {
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
  timeoutMs = 2000,
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
  getStubNetwork: () => StubNeuralNetwork<unknown, unknown>;
  confirmReset: () => Promise<void>;
}> {
  const agentId = opts.agentId ?? 'test-pet';
  const root = renderRoot();
  // Reset the stub's static instance pointer so `getStubNetwork()`
  // cannot see a leftover from a previous test.
  StubNeuralNetwork.last = null;
  setLearningAgentId(agentId);
  const fakeAgent: FakeAgent = {
    setReasoner: vi.fn(),
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
    getStubNetwork: () => {
      if (!StubNeuralNetwork.last) {
        throw new Error(
          'getStubNetwork: no NeuralNetwork has been constructed yet (did you await selectMode("learning")?)',
        );
      }
      return StubNeuralNetwork.last;
    },
    confirmReset: async () => {
      // Nothing to poll — resetSimulation runs synchronously on the
      // click handler's current turn. Yield once so any pending
      // microtasks (e.g. other listeners) drain first.
      await Promise.resolve();
    },
    selectMode: async (id) => {
      const prevCount = fakeAgent.setReasoner.mock.calls.length;
      select.value = id;
      select.dispatchEvent(new Event('change'));
      if (id === 'heuristic') {
        // Heuristic mode's construct() is synchronous in spirit and the
        // switcher itself guards against re-selecting the initial mode,
        // but when switching *from* learning back to heuristic we still
        // need to let the construct() microtask settle so the
        // setTrainVisibility call fires. Give it a generous microtask
        // flush.
        await new Promise((r) => setTimeout(r, 20));
      } else {
        await waitForCalls(fakeAgent.setReasoner, prevCount + 1);
      }
    },
  };
}

async function waitForTrainingFlush(btn: HTMLButtonElement, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!btn.disabled) return;
    await new Promise((r) => setTimeout(r, 10));
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

describe('Train click handler', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('invokes NeuralNetwork.train() with 30 synthetic pairs when clicked', async () => {
    const { document: doc, selectMode, getStubNetwork } = await mountDemo();
    await selectMode('learning');
    const btn = doc.getElementById('train-network') as HTMLButtonElement;

    btn.click();
    await waitForTrainingFlush(btn);

    const pairs = getStubNetwork().lastTrainPairs() as Array<{
      input: Record<string, number>;
      output: { score: number };
    }>;
    expect(pairs).toHaveLength(30);
    expect(pairs.every((p) => 'input' in p && 'output' in p)).toBe(true);
    expect(pairs.every((p) => typeof p.output.score === 'number')).toBe(true);
  });

  it('writes the trained network to localStorage under the agent-scoped key', async () => {
    const { document: doc, selectMode, agentId } = await mountDemo();
    await selectMode('learning');
    const btn = doc.getElementById('train-network') as HTMLButtonElement;

    btn.click();
    await waitForTrainingFlush(btn);

    const raw = localStorage.getItem(`agentonomous/${agentId}/brainjs-network`);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { stub?: boolean; trainedFrom?: unknown[] };
    expect(parsed.stub).toBe(true);
    expect(parsed.trainedFrom).toHaveLength(30);
  });

  it('disables the button and changes its text during training, then restores', async () => {
    const { document: doc, selectMode } = await mountDemo();
    await selectMode('learning');
    const btn = doc.getElementById('train-network') as HTMLButtonElement;

    btn.click();
    // After click() returns, the async handler has run synchronously up
    // to its first `await` — long enough to have flipped the button
    // into the training state.
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

  it('loads from localStorage when the brainjs-network key is present', async () => {
    const agentId = 'test-pet';
    const savedNet = { stub: true, trainedFrom: 'fake-prior-training' };
    localStorage.setItem(`agentonomous/${agentId}/brainjs-network`, JSON.stringify(savedNet));

    const { selectMode, getStubNetwork } = await mountDemo({ agentId });
    await selectMode('learning');

    expect(getStubNetwork().lastFromJSON()).toEqual(savedNet);
  });

  it('falls back to the default learning.network.json when the key is absent', async () => {
    const agentId = 'test-pet';
    localStorage.removeItem(`agentonomous/${agentId}/brainjs-network`);

    const { selectMode, getStubNetwork } = await mountDemo({ agentId });
    await selectMode('learning');

    const loaded = getStubNetwork().lastFromJSON() as { type?: string; sizes?: number[] };
    expect(loaded.sizes).toEqual([5, 1]);
  });

  it('falls back to the default when the stored value is unparseable JSON', async () => {
    const agentId = 'test-pet';
    localStorage.setItem(`agentonomous/${agentId}/brainjs-network`, '{not valid json');

    const { selectMode, getStubNetwork } = await mountDemo({ agentId });
    await selectMode('learning');

    const loaded = getStubNetwork().lastFromJSON() as { type?: string; sizes?: number[] };
    expect(loaded.sizes).toEqual([5, 1]);
  });

  it('falls back to the default when fromJSON rejects a schema-invalid payload', async () => {
    // The stored value parses as JSON (so the JSON.parse guard passes)
    // but fromJSON rejects it because the shape is wrong — e.g. a
    // manually-edited key, a prior format, or a partial migration.
    // construct() must catch that and hydrate from the bundled default
    // so Learning mode stays selectable.
    const agentId = 'test-pet';
    localStorage.setItem(
      `agentonomous/${agentId}/brainjs-network`,
      JSON.stringify({ shape: 'nonsense' }),
    );
    StubNeuralNetwork.throwOnNextFromJSON = true;

    const { selectMode, getStubNetwork } = await mountDemo({ agentId });
    await selectMode('learning');

    const loaded = getStubNetwork().lastFromJSON() as { type?: string; sizes?: number[] };
    expect(loaded.sizes).toEqual([5, 1]);
    expect(StubNeuralNetwork.throwOnNextFromJSON).toBe(false);
  });
});

describe('Reset button clears trained network', () => {
  let origLocation: Location;

  beforeEach(() => {
    localStorage.clear();
    // Auto-accept the confirm dialog raised by mountResetButton.
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    // resetSimulation() calls location.reload() after wiping storage.
    // jsdom marks `Location.prototype.reload` non-configurable, so
    // override the whole `window.location` slot — that property *is*
    // configurable on the window object.
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

  it('removes agentonomous/<agentId>/brainjs-network when Reset is clicked', async () => {
    const agentId = 'test-pet';
    localStorage.setItem(
      `agentonomous/${agentId}/brainjs-network`,
      JSON.stringify({ stub: true, trainedFrom: 'prior' }),
    );

    const { document: doc, confirmReset } = await mountDemo({ agentId });
    const resetBtn = doc.getElementById('reset-button') as HTMLButtonElement;

    resetBtn.click();
    await confirmReset();

    expect(localStorage.getItem(`agentonomous/${agentId}/brainjs-network`)).toBeNull();
  });
});
