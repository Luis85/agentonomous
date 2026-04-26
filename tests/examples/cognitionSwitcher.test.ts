// @vitest-environment jsdom
/**
 * Module-level DOM test for the demo's cognition switcher. Runs under
 * jsdom via the file-level directive. Uses the real peer-module imports
 * at runtime (mistreevous / js-son-agent / @tensorflow/tfjs-core), so
 * probe-resolution timing depends on npm's resolver rather than the
 * clock — wait with `waitForProbes` (bounded poll) instead of a fixed
 * sleep.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Path is relative from tests/examples/ to examples/product-demo/src/.
// The switcher itself imports from 'agentonomous' (bare specifier) and
// './cognition/index.js' — both resolve under vitest's default module
// resolution.
import { mountCognitionSwitcher } from '../../examples/product-demo/src/cognitionSwitcher.js';

type FakeAgent = {
  setReasoner: Mock<(r: unknown) => void>;
};

function renderRoot(): HTMLElement {
  document.body.innerHTML =
    '<div id="cognition-switcher">' +
    '<select id="cognition-mode-select"></select>' +
    '<span id="cognition-status" data-mode="heuristic">active</span>' +
    '</div>';
  return document.querySelector<HTMLElement>('#cognition-switcher')!;
}

/**
 * Poll until every `<option>` under `select` has reached a settled
 * probe state — either enabled (probe resolved true) or has a non-empty
 * `title` (probe resolved false and the switcher stamped the install
 * hint). The `heuristic` option is always-enabled from the mount loop,
 * so it's considered settled regardless.
 *
 * Replaces a fixed `setTimeout(50)` that was flaky on cold-cache runs:
 * a real dynamic `import('@tensorflow/tfjs-core')` rejection can exceed
 * 50ms on slow disks, which left the option in its initial
 * `disabled=true, title=''` state and tripped the asymmetric assertion.
 */
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

/**
 * Wait until `mock` has been called at least `n` times (default 1).
 * Replaces a fixed-yield flush that was flaky for BT mode — its
 * `construct()` awaits two dynamic imports and parses the MDSL tree,
 * which exceeds the couple-of-macrotask budget on slow machines.
 */
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
    const select = root.querySelector<HTMLSelectElement>('#cognition-mode-select')!;

    await waitForProbes(select);

    const heuristic = select.querySelector<HTMLOptionElement>('option[value="heuristic"]')!;
    expect(heuristic.disabled).toBe(false);

    // The other three depend on whether the peer resolves in the test
    // env. Root devDependencies include mistreevous + js-son-agent and
    // @tensorflow/tfjs-core + tfjs-layers, so all three are expected to
    // be available here. Assert disabled-with-tooltip iff disabled:
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
    const select = root.querySelector<HTMLSelectElement>('#cognition-mode-select')!;

    await waitForProbes(select);

    // Switch to 'bt' (not 'heuristic' — heuristic is already selected,
    // so `select.value = 'heuristic'` is a no-op change). `construct()`
    // is async, so flush the microtask queue before asserting.
    select.value = 'bt';
    select.dispatchEvent(new Event('change'));
    await waitForCalls(fakeAgent.setReasoner);

    expect(fakeAgent.setReasoner).toHaveBeenCalledTimes(1);
    const firstCall = fakeAgent.setReasoner.mock.calls[0]?.[0];
    expect(firstCall).toBeDefined();
    expect(typeof (firstCall as { selectIntention?: unknown }).selectIntention).toBe('function');
  });

  it('dispose() removes the change listener (subsequent change events are no-ops)', async () => {
    const root = renderRoot();
    const handle = mountCognitionSwitcher(fakeAgent as never, root);
    const select = root.querySelector<HTMLSelectElement>('#cognition-mode-select')!;

    await waitForProbes(select);
    handle.dispose();
    select.dispatchEvent(new Event('change'));
    expect(fakeAgent.setReasoner).not.toHaveBeenCalled();
  });

  it('dispose() before probes resolve prevents DOM mutation on late resolve', async () => {
    const root = renderRoot();
    const handle = mountCognitionSwitcher(fakeAgent as never, root);

    handle.dispose();
    // Poll-with-timeout is the wrong wait here (we expect it to time out,
    // which would be slow and noisy). Instead wait a generous macrotask
    // for any in-flight probe promises to try to flip options — the
    // `disposed` guard should bail before any DOM mutation.
    await new Promise((r) => setTimeout(r, 100));

    const select = root.querySelector<HTMLSelectElement>('#cognition-mode-select')!;
    for (const id of ['bt', 'bdi', 'learning'] as const) {
      const opt = select.querySelector<HTMLOptionElement>(`option[value="${id}"]`)!;
      expect(opt.disabled).toBe(true);
    }
  });
});
