import type { Agent } from 'agentonomous';
import { COGNITION_MODES, type CognitionModeSpec } from './cognition/index.js';

/** Handle returned by `mountCognitionSwitcher` for teardown wiring. */
export interface CognitionSwitcherHandle {
  /** Remove the `change` listener and mark the switcher disposed. */
  dispose(): void;
}

/**
 * Mount the cognition-mode dropdown into `rootEl`, probe each mode's
 * peer dep asynchronously, and wire the `change` event to
 * `agent.setReasoner`. Safe to re-mount after `dispose()`.
 *
 * Probe flow:
 * 1. Render the `<select>` with all four options present, all
 *    initially `disabled`.
 * 2. Mark heuristic enabled + selected immediately (probe always
 *    resolves true; no need to wait).
 * 3. `Promise.all` each peer-dep mode's `probe()`; flip
 *    enabled/disabled + tooltip on resolve.
 *
 * **Initial-state invariant:** no explicit `agent.setReasoner` call
 * on mount — the agent defaults to `UrgencyReasoner` at construction
 * (`src/agent/Agent.ts:251`), which matches the heuristic mode's
 * `construct()` result. The status span reads "active" under
 * heuristic because that's what the agent is already running. If a
 * future change moves the agent's default away from `UrgencyReasoner`,
 * this invariant needs revisiting — flagged with a runtime check
 * below.
 *
 * **Re-mount invariant:** `dispose()` marks a closure-local flag and
 * the late-probe guard uses it. After `dispose()`, a fresh
 * `mountCognitionSwitcher` call builds a new closure with a new
 * `disposed = false` and a fresh option set (via a `removeChild`
 * loop that detaches the old option nodes). Stale probes from the
 * old closure no-op via the `disposed` guard before any DOM mutation
 * — even though `select.querySelector` on the old closure would now
 * return the NEW option nodes (same `<select>` element, new children).
 *
 * **Concurrent-change guard:** each `change` invocation captures an
 * epoch; if a later `change` starts before the previous `construct()`
 * resolves, only the most-recent epoch is allowed to call
 * `setReasoner`. Without this, rapid selection could land the agent
 * on whichever reasoner's `construct()` finishes last rather than
 * whichever the user picked last.
 *
 * The switcher intentionally does not persist selection across
 * reloads or demo resets — a fresh mount always starts at heuristic.
 */
export function mountCognitionSwitcher(agent: Agent, rootEl: HTMLElement): CognitionSwitcherHandle {
  const select = rootEl.querySelector<HTMLSelectElement>('#cognition-mode-select');
  const status = rootEl.querySelector<HTMLElement>('#cognition-status');
  if (!select || !status) {
    throw new Error(
      'cognitionSwitcher: expected #cognition-mode-select + #cognition-status in rootEl',
    );
  }

  // Clear any pre-rendered HTML options from index.html and rebuild
  // from the registry via createElement + textContent (no innerHTML
  // interpolation — forward-proofs against mode labels becoming
  // dynamic / user-supplied in the future, even though the current
  // labels are static string literals).
  while (select.firstChild) select.removeChild(select.firstChild);
  for (const m of COGNITION_MODES) {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = m.label;
    option.disabled = true;
    if (m.id === 'heuristic') {
      option.disabled = false;
      option.selected = true;
    }
    select.appendChild(option);
  }

  let disposed = false;
  let changeEpoch = 0;

  const onChange = async (): Promise<void> => {
    if (disposed) return;
    const mode = COGNITION_MODES.find((m) => m.id === select.value);
    if (!mode) return;
    const myEpoch = ++changeEpoch;
    const reasoner = await mode.construct();
    // Bail if disposed mid-await OR if a newer change has superseded us.
    if (disposed || myEpoch !== changeEpoch) return;
    agent.setReasoner(reasoner);
    status.dataset.mode = mode.id;
    status.textContent = 'active';
  };
  const onChangeWrapped = (): void => {
    void onChange();
  };
  select.addEventListener('change', onChangeWrapped);

  // Probe each mode in parallel. After each resolves, flip its option
  // enabled/disabled + tooltip. Late-probe guard (see JSDoc invariant
  // above) prevents DOM mutation after dispose().
  void Promise.all(
    COGNITION_MODES.map(async (mode: CognitionModeSpec) => {
      const available = await mode.probe();
      if (disposed) return;
      const option = select.querySelector<HTMLOptionElement>(`option[value="${mode.id}"]`);
      if (!option) return;
      if (available) {
        option.disabled = false;
        option.removeAttribute('title');
      } else {
        option.disabled = true;
        option.title = mode.peerName ? `Install ${mode.peerName} to enable` : 'Unavailable';
      }
    }),
  );

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      select.removeEventListener('change', onChangeWrapped);
    },
  };
}
