import type { Agent, Reasoner } from 'agentonomous';
import { COGNITION_MODES, type CognitionModeSpec } from './cognition/index.js';

const NEED_IDS = ['hunger', 'cleanliness', 'happiness', 'energy', 'health'] as const;
const TRAIN_PAIR_COUNT = 30;
const TRAIN_EPOCHS = 100;
const TRAINED_FLASH_MS = 1500;

/**
 * Duck-typed view of `TfjsReasoner`'s train + snapshot surface. The
 * switcher doesn't import the adapter to keep the tfjs peer out of
 * heuristic/bdi/bt loads — any reasoner exposing these methods is
 * treated as trainable.
 */
type TrainResultLike = {
  finalLoss?: number;
  history?: { loss?: readonly number[] };
};
type TrainableReasoner = {
  train: (
    pairs: Array<{ features: number[]; label: number[] }>,
    opts?: { epochs?: number; learningRate?: number; seed?: number; shuffle?: boolean },
  ) => Promise<TrainResultLike>;
  toJSON: () => unknown;
  dispose?: () => void;
};

/**
 * Seeded RNG for the demo's Train button. Deliberately NOT drawn from
 * `agent.rng` — mutating the agent's RNG stream from a DOM-event handler
 * would desync subsequent tick draws under replay. This RNG is the
 * demo's own resource; its seed is fixed at module load so training
 * runs are reproducible across reloads.
 */
function createTrainRng(seed = 0xc0ffee): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
const trainRng = createTrainRng();

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
 * **Construct-error handling:** if `mode.construct()` rejects, the
 * switcher leaves the previously-active reasoner in place, marks the
 * failing option disabled with an error tooltip, and reverts the
 * `<select>` + status span to the last working mode so the user isn't
 * stranded with a UI that lies about which reasoner is running.
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
  const untrainBtn = document.getElementById('untrain-network') as HTMLButtonElement | null;
  const setTrainVisibility = (modeId: CognitionModeSpec['id']): void => {
    const show = modeId === 'learning';
    if (trainBtn) {
      if (show) trainBtn.removeAttribute('hidden');
      else trainBtn.setAttribute('hidden', '');
    }
    if (untrainBtn) {
      if (show) untrainBtn.removeAttribute('hidden');
      else untrainBtn.setAttribute('hidden', '');
    }
  };

  let disposed = false;
  let changeEpoch = 0;
  let activeModeId: CognitionModeSpec['id'] = 'heuristic';
  let activeReasoner: Reasoner | null = null;
  // If the Train button is in flight when the user swaps modes, the
  // outgoing reasoner still has a live `model.fit` running against its
  // tensors. Disposing it immediately frees those tensors mid-fit and
  // turns the pending `train` promise into an unhandled rejection. We
  // track the in-flight promise + its owning reasoner and defer disposal
  // of that one reasoner until training settles.
  let trainingReasoner: Reasoner | null = null;
  let pendingTrain: Promise<void> | null = null;

  const disposeNow = (reasoner: Reasoner | null): void => {
    if (!reasoner) return;
    const maybe = reasoner as { dispose?: () => void };
    if (typeof maybe.dispose === 'function') {
      try {
        maybe.dispose();
      } catch {
        // Best-effort — disposal shouldn't block the UI.
      }
    }
  };

  const disposeIfOwned = (reasoner: Reasoner | null): void => {
    if (!reasoner) return;
    if (reasoner === trainingReasoner && pendingTrain) {
      // Defer until training settles, then dispose.
      void pendingTrain.catch(() => undefined).then(() => disposeNow(reasoner));
      return;
    }
    disposeNow(reasoner);
  };

  const onChange = async (): Promise<void> => {
    if (disposed) return;
    const mode = COGNITION_MODES.find((m) => m.id === select.value);
    if (!mode) return;
    const myEpoch = ++changeEpoch;
    try {
      const reasoner = await mode.construct();
      if (disposed || myEpoch !== changeEpoch) {
        disposeIfOwned(reasoner);
        return;
      }
      const previous = activeReasoner;
      agent.setReasoner(reasoner);
      activeReasoner = reasoner;
      activeModeId = mode.id;
      disposeIfOwned(previous);
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

  const onTrainClick = async (): Promise<void> => {
    if (!trainBtn) return;
    if (disposed) return;
    const reasonerHandle = activeReasoner;
    const reasoner = reasonerHandle as Partial<TrainableReasoner> | null;
    if (
      !reasonerHandle ||
      !reasoner ||
      typeof reasoner.train !== 'function' ||
      typeof reasoner.toJSON !== 'function'
    )
      return;

    const originalText = trainBtn.textContent ?? 'Train';
    trainBtn.disabled = true;
    trainBtn.textContent = 'Training…';
    await new Promise<void>((r) => setTimeout(r, 0));

    const run = async (): Promise<void> => {
      if (disposed) return;
      const pairs = Array.from({ length: TRAIN_PAIR_COUNT }, () => {
        const features: number[] = [];
        let min = 1;
        for (let i = 0; i < NEED_IDS.length; i++) {
          const level = agent.rng.next();
          features.push(level);
          if (level < min) min = level;
        }
        const urgency = 1 - min;
        return { features, label: [urgency] };
      });
      const result = await reasoner.train!(pairs, {
        epochs: TRAIN_EPOCHS,
        learningRate: 0.1,
        seed: Math.floor(trainRng() * 0x7fff_ffff),
      });
      try {
        const snapshot = reasoner.toJSON!();
        globalThis.localStorage?.setItem(
          `agentonomous/${agent.identity.id}/tfjs-network`,
          JSON.stringify(snapshot),
        );
      } catch {
        // localStorage unavailable — training still succeeds for this session.
      }
      flashStatus(status, formatTrainedToast(result), TRAINED_FLASH_MS);
    };

    trainingReasoner = reasonerHandle;
    const promise = run();
    pendingTrain = promise.catch(() => undefined);
    try {
      await promise;
    } finally {
      if (trainingReasoner === reasonerHandle) {
        trainingReasoner = null;
        pendingTrain = null;
      }
      trainBtn.disabled = false;
      trainBtn.textContent = originalText;
    }
  };
  const onTrainClickWrapped = (): void => {
    void onTrainClick();
  };
  if (trainBtn) trainBtn.addEventListener('click', onTrainClickWrapped);

  const onUntrainClick = async (): Promise<void> => {
    if (!untrainBtn || disposed) return;
    if (activeModeId !== 'learning') return;

    const originalText = untrainBtn.textContent ?? 'Untrain';
    untrainBtn.disabled = true;
    untrainBtn.textContent = 'Resetting…';
    if (trainBtn) trainBtn.disabled = true;
    const myEpoch = ++changeEpoch;

    // If Train is in flight, wait for it to finish before wiping the
    // snapshot key. Otherwise the pending `localStorage.setItem(...)` at
    // the tail of `onTrainClick` would re-persist trained weights after
    // Untrain has cleared them — the user would see "Reset to baseline ✓"
    // but a reload would still hydrate the trained model.
    if (pendingTrain) {
      try {
        await pendingTrain;
      } catch {
        // Train rejections are already surfaced via the train-click
        // handler; Untrain just needs the persist step to have settled.
      }
    }
    // Clear only the tfjs snapshot key — leave the rest of the agent's
    // persisted state alone (this is not a full reset). A fresh
    // `construct()` then rehydrates from the bundled baseline.
    try {
      globalThis.localStorage?.removeItem(`agentonomous/${agent.identity.id}/tfjs-network`);
    } catch {
      // localStorage unavailable — the next construct() falls back to
      // the bundled baseline anyway.
    }

    const mode = COGNITION_MODES.find((m) => m.id === 'learning');
    if (!mode) {
      if (!disposed) {
        untrainBtn.disabled = false;
        untrainBtn.textContent = originalText;
        if (trainBtn) trainBtn.disabled = false;
      }
      return;
    }

    try {
      const reasoner = await mode.construct();
      if (disposed || myEpoch !== changeEpoch) {
        disposeIfOwned(reasoner);
        return;
      }
      const previous = activeReasoner;
      agent.setReasoner(reasoner);
      activeReasoner = reasoner;
      disposeIfOwned(previous);
      flashStatus(status, 'Reset to baseline ✓', TRAINED_FLASH_MS);
    } catch (err) {
      if (disposed || myEpoch !== changeEpoch) return;
      // eslint-disable-next-line no-console -- user-visible diagnostic.
      console.error('cognitionSwitcher: untrain failed', err);
      flashStatus(status, 'Untrain failed', TRAINED_FLASH_MS);
    } finally {
      if (!disposed) {
        untrainBtn.disabled = false;
        untrainBtn.textContent = originalText;
        if (trainBtn) trainBtn.disabled = false;
      }
    }
  };
  const onUntrainClickWrapped = (): void => {
    void onUntrainClick();
  };
  if (untrainBtn) untrainBtn.addEventListener('click', onUntrainClickWrapped);

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
      if (untrainBtn) untrainBtn.removeEventListener('click', onUntrainClickWrapped);
      disposeIfOwned(activeReasoner);
      activeReasoner = null;
    },
  };
}

/**
 * Render the post-train toast. Prefers the loss delta ("0.42 → 0.08")
 * when both the initial-epoch loss and the final loss are reported; falls
 * back to a bare checkmark if the training result is sparse.
 */
function formatTrainedToast(result: TrainResultLike): string {
  const history = result.history?.loss;
  const initialLoss = history && history.length > 0 ? history[0] : undefined;
  const finalLoss = result.finalLoss ?? (history ? history[history.length - 1] : undefined);
  if (
    typeof initialLoss === 'number' &&
    Number.isFinite(initialLoss) &&
    typeof finalLoss === 'number' &&
    Number.isFinite(finalLoss)
  ) {
    return `Trained ✓ — loss ${initialLoss.toFixed(2)} → ${finalLoss.toFixed(2)}`;
  }
  return 'Trained ✓';
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
