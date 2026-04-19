// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Path is relative from tests/examples/ to examples/nurture-pet/src/.
// The switcher itself imports from 'agentonomous' (bare specifier) and
// './cognition/index.js' — both resolve under vitest's default module
// resolution.
import { mountCognitionSwitcher } from '../../examples/nurture-pet/src/cognitionSwitcher.js';

interface FakeAgent {
  setReasoner: (r: unknown) => void;
}

function renderRoot(): HTMLElement {
  document.body.innerHTML = `
    <div id="cognition-switcher">
      <select id="cognition-mode-select"></select>
      <span id="cognition-status" data-mode="heuristic">active</span>
    </div>
  `;
  return document.querySelector<HTMLElement>('#cognition-switcher')!;
}

describe('mountCognitionSwitcher', () => {
  let fakeAgent: FakeAgent;

  beforeEach(() => {
    fakeAgent = { setReasoner: vi.fn() };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders all four modes with heuristic selected by default', () => {
    const root = renderRoot();
    mountCognitionSwitcher(fakeAgent as never, root);
    const select = root.querySelector<HTMLSelectElement>('#cognition-mode-select')!;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['heuristic', 'bt', 'bdi', 'learning']);
    expect(select.value).toBe('heuristic');
  });

  it('enables available modes and disables missing-peer modes with a tooltip', async () => {
    const root = renderRoot();
    mountCognitionSwitcher(fakeAgent as never, root);

    // Wait a macrotask for Promise.all to settle.
    await new Promise((r) => setTimeout(r, 50));

    const select = root.querySelector<HTMLSelectElement>('#cognition-mode-select')!;
    const heuristic = select.querySelector<HTMLOptionElement>('option[value="heuristic"]')!;
    expect(heuristic.disabled).toBe(false);

    // The other three depend on whether the peer resolves in the test
    // env. Root devDependencies include mistreevous + js-son-agent;
    // brain.js is installed as a demo devDep — at test runtime it may
    // or may not be hoisted. Assert disabled-with-tooltip iff disabled:
    for (const id of ['bt', 'bdi', 'learning'] as const) {
      const opt = select.querySelector<HTMLOptionElement>(`option[value="${id}"]`)!;
      if (opt.disabled) {
        expect(opt.title).toMatch(/^Install .+ to enable$/);
      } else {
        expect(opt.title).toBe('');
      }
    }
  });

  it('calls agent.setReasoner with the constructed reasoner on change', async () => {
    const root = renderRoot();
    mountCognitionSwitcher(fakeAgent as never, root);
    // Wait for probes to resolve and BT to become enabled (requires
    // mistreevous to be installed — it's a root devDep, so this should
    // succeed in the normal test env).
    await new Promise((r) => setTimeout(r, 100));

    const select = root.querySelector<HTMLSelectElement>('#cognition-mode-select')!;
    // Switch to 'bt' (not 'heuristic' — heuristic is already selected,
    // so `select.value = 'heuristic'` is a no-op change). `construct()`
    // is async, so wait a macrotask for the await chain to land before
    // asserting.
    select.value = 'bt';
    select.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 50));

    expect(fakeAgent.setReasoner).toHaveBeenCalledTimes(1);
    const mockCalls = (fakeAgent.setReasoner as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    const firstCall = mockCalls[0]?.[0];
    expect(firstCall).toBeDefined();
    expect(typeof (firstCall as { selectIntention?: unknown }).selectIntention).toBe('function');
  });

  it('dispose() removes the change listener (subsequent change events are no-ops)', async () => {
    const root = renderRoot();
    const handle = mountCognitionSwitcher(fakeAgent as never, root);
    await new Promise((r) => setTimeout(r, 50));

    handle.dispose();
    const select = root.querySelector<HTMLSelectElement>('#cognition-mode-select')!;
    select.dispatchEvent(new Event('change'));
    expect(fakeAgent.setReasoner).not.toHaveBeenCalled();
  });

  it('dispose() before probes resolve prevents DOM mutation on late resolve', async () => {
    const root = renderRoot();
    const handle = mountCognitionSwitcher(fakeAgent as never, root);

    handle.dispose();
    // Wait for probes to resolve. Disabled flags should NOT flip to
    // enabled because the probe callbacks guard on `disposed`.
    await new Promise((r) => setTimeout(r, 50));

    const select = root.querySelector<HTMLSelectElement>('#cognition-mode-select')!;
    for (const id of ['bt', 'bdi', 'learning'] as const) {
      const opt = select.querySelector<HTMLOptionElement>(`option[value="${id}"]`)!;
      expect(opt.disabled).toBe(true);
    }
  });
});
