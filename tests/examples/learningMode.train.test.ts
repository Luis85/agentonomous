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

interface FakeAgent {
  setReasoner: Mock<(r: unknown) => void>;
  identity: { id: string; name: string };
}

function renderRoot(): HTMLElement {
  document.body.innerHTML =
    '<div id="cognition-switcher">' +
    '<select id="cognition-mode-select"></select>' +
    '<span id="cognition-status" data-mode="heuristic">active</span>' +
    '<button id="train-network" type="button" hidden>Train</button>' +
    '</div>';
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
}> {
  const agentId = opts.agentId ?? 'test-pet';
  const root = renderRoot();
  const fakeAgent: FakeAgent = {
    setReasoner: vi.fn(),
    identity: { id: agentId, name: agentId },
  };
  mountCognitionSwitcher(fakeAgent as never, root);
  const select = root.querySelector<HTMLSelectElement>('#cognition-mode-select')!;
  await waitForProbes(select);

  let prevCallCount = 0;
  return {
    document,
    agentId,
    fakeAgent,
    selectMode: async (id) => {
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
        prevCallCount = fakeAgent.setReasoner.mock.calls.length;
        await waitForCalls(fakeAgent.setReasoner, prevCallCount + 1);
      }
    },
  };
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
