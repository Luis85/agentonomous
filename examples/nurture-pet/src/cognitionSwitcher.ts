import type { Agent, Reasoner } from 'agentonomous';
import { COGNITION_MODES, type CognitionModeSpec } from './cognition/index.js';

const NEED_IDS = ['hunger', 'cleanliness', 'happiness', 'energy', 'health'] as const;
const TRAIN_PAIR_COUNT = 30;
const TRAIN_ITERATIONS = 100;
const TRAIN_ERROR_THRESH = 0.005;
const TRAINED_FLASH_MS = 1500;

/**
 * Duck-typed view of the subset of `brain.js`'s `NeuralNetwork` that the
 * Train click handler uses. Kept structural so the switcher doesn't
 * import the brain.js adapter just to type-narrow.
 */
type TrainableNetwork = {
  train: (pairs: unknown, opts: unknown) => void;
  toJSON: () => unknown;
};

/**
 * Duck-typed view of `BrainJsReasoner`'s inspection surface. The
 * learning mode's `construct()` returns a `BrainJsReasoner`; here we
 * just need the `getNetwork()` handle without coupling the switcher to
 * the adapter package.
 */
type NetworkHoldingReasoner = { getNetwork: () => TrainableNetwork };

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
 * **Construct-error handling:** if `mode.construct()` rejects (e.g.
 * the peer's runtime export shape disagrees with the adapter — the
 * CJS-interop case in the plan's §Risks table), the switcher leaves
 * the previously-active reasoner in place, marks the failing option
 * disabled with an error tooltip, and reverts the `<select>` + status
 * span to the last working mode so the user isn't stranded with a UI
 * that lies about which reasoner is running.
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

  const trainBtn = document.getElementById('train-network') as HTMLButtonElement | null;
  const setTrainVisibility = (modeId: CognitionModeSpec['id']): void => {
    if (!trainBtn) return;
    if (modeId === 'learning') trainBtn.removeAttribute('hidden');
    else trainBtn.setAttribute('hidden', '');
  };

  let disposed = false;
  let changeEpoch = 0;
  // Tracks the mode id currently wired into the agent, so a failing
  // `construct()` can revert the `<select>` + status to the last-good
  // mode rather than leaving the UI inconsistent with reality.
  let activeModeId: CognitionModeSpec['id'] = 'heuristic';
  // The reasoner last handed to `agent.setReasoner`. The Train click
  // handler reads this to reach the underlying network — cheaper than
  // widening `CognitionModeSpec` with a per-mode "trainable" flag.
  let activeReasoner: Reasoner | null = null;

  const onChange = async (): Promise<void> => {
    if (disposed) return;
    const mode = COGNITION_MODES.find((m) => m.id === select.value);
    if (!mode) return;
    const myEpoch = ++changeEpoch;
    try {
      const reasoner = await mode.construct();
      // Bail if disposed mid-await OR if a newer change has superseded us.
      if (disposed || myEpoch !== changeEpoch) return;
      agent.setReasoner(reasoner);
      activeReasoner = reasoner;
      activeModeId = mode.id;
      status.dataset.mode = mode.id;
      status.textContent = 'active';
      setTrainVisibility(mode.id);
    } catch (err) {
      if (disposed || myEpoch !== changeEpoch) return;
      // eslint-disable-next-line no-console -- user-visible diagnostic.
      console.error('cognitionSwitcher: construct() failed for mode', mode.id, err);
      const failed = select.querySelector<HTMLOptionElement>(`option[value="${mode.id}"]`);
      if (failed) {
        failed.disabled = true;
        failed.title = `${mode.label} failed to load (see console)`;
      }
      // Programmatic assignment does NOT refire the change event, so
      // no recursion risk here. Status span reflects the actually-
      // active reasoner (unchanged).
      select.value = activeModeId;
      status.dataset.mode = activeModeId;
      status.textContent = 'active';
      setTrainVisibility(activeModeId);
    }
  };
  const onChangeWrapped = (): void => {
    void onChange();
  };
  select.addEventListener('change', onChangeWrapped);

  // --- Train button wiring ----------------------------------------------
  // One-shot click handler attached at mount. Reads `activeReasoner`
  // from the closure at click time so a fresh `learningMode.construct()`
  // (triggered by a mode switch or a subsequent remount) is always
  // trained rather than a stale instance.
  const onTrainClick = async (): Promise<void> => {
    if (!trainBtn) return;
    if (disposed) return;
    const reasoner = activeReasoner;
    const holder = reasoner as Partial<NetworkHoldingReasoner> | null;
    if (!holder || typeof holder.getNetwork !== 'function') return;

    const originalText = trainBtn.textContent ?? 'Train';
    trainBtn.disabled = true;
    trainBtn.textContent = 'Training…';
    // Yield to the event loop so the disabled/"Training…" state paints
    // before the synchronous training loop pins the main thread. Also
    // gives the "disables during training" test a moment between
    // `click()` and the train call to observe the in-flight state.
    await new Promise<void>((r) => setTimeout(r, 0));
    try {
      if (disposed) return;
      const network = holder.getNetwork();
      const pairs = Array.from({ length: TRAIN_PAIR_COUNT }, () => {
        const input: Record<string, number> = {};
        let min = 1;
        for (const id of NEED_IDS) {
          const level = agent.rng.next();
          input[id] = level;
          if (level < min) min = level;
        }
        const urgency = 1 - min;
        return { input, output: { score: urgency } };
      });
      network.train(pairs, {
        iterations: TRAIN_ITERATIONS,
        errorThresh: TRAIN_ERROR_THRESH,
      });
      try {
        globalThis.localStorage?.setItem(
          `agentonomous/${agent.identity.id}/brainjs-network`,
          JSON.stringify(network.toJSON()),
        );
      } catch {
        // localStorage unavailable (private mode, quota) — training
        // still succeeds for this session, just won't survive reload.
      }
      flashStatus(status, 'Trained ✓', TRAINED_FLASH_MS);
    } finally {
      trainBtn.disabled = false;
      trainBtn.textContent = originalText;
    }
  };
  const onTrainClickWrapped = (): void => {
    void onTrainClick();
  };
  if (trainBtn) trainBtn.addEventListener('click', onTrainClickWrapped);

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
      if (trainBtn) trainBtn.removeEventListener('click', onTrainClickWrapped);
    },
  };
}

/**
 * Temporarily replace the status span's text with `message` for
 * `durationMs`, then restore the prior text. Used to surface transient
 * feedback ("Trained ✓") without stacking event listeners or needing a
 * dedicated toast element.
 */
function flashStatus(statusEl: HTMLElement, message: string, durationMs: number): void {
  const previous = statusEl.textContent ?? '';
  statusEl.textContent = message;
  globalThis.setTimeout?.(() => {
    if (statusEl.textContent === message) statusEl.textContent = previous;
  }, durationMs);
}
