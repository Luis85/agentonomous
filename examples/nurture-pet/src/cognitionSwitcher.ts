import type { Agent, Learner, Reasoner } from 'agentonomous';
import { NoopLearner } from 'agentonomous';
import { COGNITION_MODES, type CognitionModeSpec } from './cognition/index.js';
import { buildLearningLearner, SOFTMAX_SKILL_IDS } from './cognition/learning.js';
import { clearLossSparkline, renderLossSparkline } from './lossSparkline.js';

/**
 * Match the LEARNER_BATCH_SIZE in `cognition/learning.ts`. Duplicated
 * here so the HUD readout can render the threshold without forcing the
 * switcher to depend on the learning module's runtime constants. The
 * `learningMode.train.test.ts` covers the wiring; if the constants drift
 * apart, that test will surface the mismatch.
 */
const LEARNER_BATCH_SIZE = 50;
const LEARNER_READOUT_POLL_MS = 200;

type DisposableLearner = Learner & {
  bufferedCount?: () => number;
  isTraining?: () => boolean;
  dispose?: () => void;
};

const NEED_IDS = ['hunger', 'cleanliness', 'happiness', 'energy', 'health'] as const;
const TRAIN_PAIR_COUNT = 30;
const TRAIN_EPOCHS = 100;
const TRAINED_FLASH_MS = 1500;

/**
 * Map a 5-dim need-level feature vector to a 7-dim one-hot label over
 * `SOFTMAX_SKILL_IDS`. The mapping mirrors the heuristic the demo's
 * baseline network was seeded against (see
 * `scripts/seed-learning-network.ts`):
 *
 * - The lowest need maps to a maintenance skill —
 *   `hunger → feed`, `cleanliness → clean`, `happiness → play`,
 *   `energy → rest`, `health → medicate`.
 * - When every need is comfortably high (`min(needs) > 0.7`) we treat
 *   the state as a bonding moment → `pet`.
 * - When happiness is very high but energy is low (over-stimulated +
 *   jittery) we treat the state as needing a boundary → `scold`.
 *
 * The synthetic Train button thus produces the same archetype
 * distribution as the bundled baseline, so a click reinforces the
 * heuristic the network already approximates rather than fighting it.
 * Live agent outcomes (via `projectLearningOutcome`) push the network
 * away from this baseline as the user actually interacts with the pet.
 */
function featuresToOneHotLabel(features: readonly number[]): number[] {
  const label = new Array<number>(SOFTMAX_SKILL_IDS.length).fill(0);
  const hunger = features[0] ?? 0;
  const cleanliness = features[1] ?? 0;
  const happiness = features[2] ?? 0;
  const energy = features[3] ?? 0;
  const health = features[4] ?? 0;
  // `pet` archetype: every need comfortably high.
  const minLevel = Math.min(hunger, cleanliness, happiness, energy, health);
  if (minLevel > 0.7) {
    label[SOFTMAX_SKILL_IDS.indexOf('pet')] = 1;
    return label;
  }
  // `scold` archetype: over-stimulated but jittery.
  if (happiness > 0.8 && energy < 0.4) {
    label[SOFTMAX_SKILL_IDS.indexOf('scold')] = 1;
    return label;
  }
  // Lowest-need-wins maintenance mapping.
  const needToSkill = ['feed', 'clean', 'play', 'rest', 'medicate'] as const;
  let minIdx = 0;
  let minVal = features[0] ?? 0;
  for (let i = 1; i < NEED_IDS.length; i++) {
    const v = features[i] ?? 0;
    if (v < minVal) {
      minVal = v;
      minIdx = i;
    }
  }
  // hunger/cleanliness/happiness/energy/health → feed/clean/play/rest/medicate.
  const skill = needToSkill[minIdx] ?? 'feed';
  label[SOFTMAX_SKILL_IDS.indexOf(skill)] = 1;
  return label;
}

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
    opts?: {
      epochs?: number;
      learningRate?: number;
      seed?: number;
      shuffle?: boolean;
      onEpochEnd?: (epoch: number, loss: number) => void;
    },
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
 * Set the agent's Stage-8 learner if `setLearner` is available. The
 * library-side method shipped alongside this row, but tests / older
 * consumers may pass an agent stub without it — guard rather than
 * throw so a one-off harness doesn't have to mock the whole API.
 */
function maybeSetLearner(agent: Agent, learner: Learner): void {
  const fn = (agent as unknown as { setLearner?: (l: Learner) => void }).setLearner;
  if (typeof fn === 'function') fn.call(agent, learner);
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
  const sparkline = document.getElementById('loss-sparkline') as unknown as SVGSVGElement | null;
  const learnerReadout = document.getElementById('learner-buffer') as HTMLElement | null;
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
    if (learnerReadout) {
      if (show) learnerReadout.removeAttribute('hidden');
      else {
        learnerReadout.setAttribute('hidden', '');
        learnerReadout.textContent = '';
      }
    }
    // Sparkline is gated on `learning` mode AND the presence of a prior
    // train run; renderLossSparkline / clearLossSparkline manage the
    // hidden attribute. Switching away from learning forces a clear so a
    // stale curve doesn't bleed into other modes.
    if (sparkline && !show) clearLossSparkline(sparkline);
  };

  let disposed = false;
  let changeEpoch = 0;
  let activeModeId: CognitionModeSpec['id'] = 'heuristic';
  let activeReasoner: Reasoner | null = null;
  // The Learning-mode TfjsLearner is constructed alongside the reasoner
  // (`buildLearningLearner` in `cognition/learning.ts`) and torn down
  // when the user switches away. Other modes leave the agent on a
  // NoopLearner. Tracking the active instance here lets the HUD readout
  // poll its buffer + the Untrain handler dispose it cleanly.
  let activeLearner: DisposableLearner | null = null;
  let learnerReadoutTimer: number | null = null;
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

  const renderLearnerReadout = (): void => {
    if (!learnerReadout) return;
    const l = activeLearner;
    if (!l || typeof l.bufferedCount !== 'function') {
      learnerReadout.textContent = '';
      return;
    }
    const buffered = l.bufferedCount();
    const training = typeof l.isTraining === 'function' && l.isTraining();
    learnerReadout.textContent = training
      ? `Buffered: ${buffered}/${LEARNER_BATCH_SIZE} — training…`
      : `Buffered: ${buffered}/${LEARNER_BATCH_SIZE}`;
  };

  const startLearnerReadout = (): void => {
    if (learnerReadoutTimer !== null) return;
    renderLearnerReadout();
    learnerReadoutTimer = globalThis.setInterval(
      renderLearnerReadout,
      LEARNER_READOUT_POLL_MS,
    ) as unknown as number;
  };

  const stopLearnerReadout = (): void => {
    if (learnerReadoutTimer === null) return;
    globalThis.clearInterval(learnerReadoutTimer);
    learnerReadoutTimer = null;
  };

  /**
   * Replace the agent's Stage-8 learner. For learning mode, builds a
   * `TfjsLearner` that batch-trains the reasoner on observed outcomes;
   * for every other mode, falls back to `NoopLearner` so accumulated
   * outcomes from the prior mode don't bleed across switches.
   *
   * Returns the new learner so the caller can stash it as the in-flight
   * reference for HUD readout / disposal coordination.
   */
  const swapLearner = async (
    modeId: CognitionModeSpec['id'],
    reasoner: Reasoner,
  ): Promise<DisposableLearner> => {
    if (modeId === 'learning') {
      const learner = (await buildLearningLearner(agent, reasoner)) as DisposableLearner;
      maybeSetLearner(agent, learner);
      return learner;
    }
    const noop = new NoopLearner() as DisposableLearner;
    maybeSetLearner(agent, noop);
    return noop;
  };

  const disposeLearner = (l: DisposableLearner | null): void => {
    if (!l) return;
    if (typeof l.dispose === 'function') {
      try {
        l.dispose();
      } catch {
        // Best-effort — disposal must not block the UI.
      }
    }
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
      const previousReasoner = activeReasoner;
      const previousLearner = activeLearner;
      agent.setReasoner(reasoner);
      activeReasoner = reasoner;
      activeModeId = mode.id;
      disposeIfOwned(previousReasoner);
      // Swap learners after the reasoner is in place — the new learner
      // closes over the new reasoner via `buildLearningLearner`.
      const learner = await swapLearner(mode.id, reasoner);
      if (disposed || myEpoch !== changeEpoch) {
        disposeLearner(learner);
        return;
      }
      activeLearner = learner;
      disposeLearner(previousLearner);
      status.dataset.mode = mode.id;
      status.textContent = 'active';
      setTrainVisibility(mode.id);
      if (mode.id === 'learning') startLearnerReadout();
      else stopLearnerReadout();
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
    // Lock Untrain out of the UI for the duration of the train so the
    // two handlers can't race on the `localStorage.setItem(...)` tail
    // below.
    if (untrainBtn) untrainBtn.disabled = true;

    const run = async (): Promise<void> => {
      // Yield once so the browser paints the "Training…" label before
      // the synchronous `model.fit` bookkeeping inside the reasoner
      // begins. The yield now lives INSIDE `run`, after
      // `pendingTrain` is set — so Untrain's `pendingTrain !== null`
      // gate can't be bypassed during this microtask window.
      await new Promise<void>((r) => setTimeout(r, 0));
      if (disposed) return;
      const pairs = Array.from({ length: TRAIN_PAIR_COUNT }, () => {
        const features: number[] = [];
        for (let i = 0; i < NEED_IDS.length; i++) {
          features.push(agent.rng.next());
        }
        return { features, label: featuresToOneHotLabel(features) };
      });
      // Live mid-fit progress: update the button text + push points
      // into the sparkline as each epoch completes. Both branches are
      // gated on the run still owning the active reasoner so a stale
      // callback after a mode switch doesn't leak into the new HUD.
      const liveLosses: number[] = [];
      const result = await reasoner.train!(pairs, {
        epochs: TRAIN_EPOCHS,
        learningRate: 0.1,
        seed: Math.floor(trainRng() * 0x7fff_ffff),
        onEpochEnd: (epoch, loss) => {
          if (disposed) return;
          if (reasonerHandle !== activeReasoner || activeModeId !== 'learning') return;
          // `epoch` is 0-indexed; show 1-indexed N/M.
          trainBtn.textContent = `Training… ${epoch + 1}/${TRAIN_EPOCHS}`;
          liveLosses.push(loss);
          if (sparkline && liveLosses.length >= 2) {
            renderLossSparkline(sparkline, liveLosses);
          }
        },
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
      const losses = result.history?.loss;
      // Race guard: a `train()` started in Learning mode can resolve
      // *after* the user has switched to a different cognition mode.
      // `setTrainVisibility` already cleared the sparkline on that
      // switch — repopulating it here would leak stale training state
      // into a non-Learning HUD. Gate on the run still owning the
      // active reasoner AND the active mode still being Learning.
      if (
        sparkline &&
        losses &&
        losses.length > 0 &&
        activeModeId === 'learning' &&
        reasonerHandle === activeReasoner
      ) {
        renderLossSparkline(sparkline, losses);
      }
      flashStatus(status, formatTrainedToast(result), TRAINED_FLASH_MS);
    };

    // Mark training as in-flight BEFORE any yield so Untrain's
    // `pendingTrain !== null` guard catches the race window between
    // the click and the first microtask tick.
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
      if (untrainBtn) untrainBtn.disabled = false;
    }
  };
  const onTrainClickWrapped = (): void => {
    void onTrainClick();
  };
  if (trainBtn) trainBtn.addEventListener('click', onTrainClickWrapped);

  const onUntrainClick = async (): Promise<void> => {
    // Hard gate first, all preconditions on a single line so a reader
    // can see at a glance that Untrain is BLOCKED while Train is in
    // flight. The Train handler also disables the Untrain button when
    // it starts, but a programmatic caller or stale click could still
    // reach here — refuse rather than interleave, or Train's trailing
    // `localStorage.setItem(...)` would re-persist trained weights
    // after Untrain wipes them.
    if (!untrainBtn || disposed || pendingTrain !== null) return;
    if (activeModeId !== 'learning') return;

    const originalText = untrainBtn.textContent ?? 'Untrain';
    untrainBtn.disabled = true;
    untrainBtn.textContent = 'Resetting…';
    if (trainBtn) trainBtn.disabled = true;
    const myEpoch = ++changeEpoch;

    // Optimistically snap the selector / status / train-button
    // visibility to `'learning'` right now. Bumping `changeEpoch`
    // discarded any in-flight `onChange` work — including a non-
    // learning mode selection the user may have clicked just before
    // Untrain — so the UI would otherwise keep showing that cancelled
    // mode's label while the agent is running learning.
    if (select.value !== 'learning') select.value = 'learning';
    status.dataset.mode = 'learning';
    setTrainVisibility('learning');
    // `flashStatus` captures `status.textContent` at call time as the
    // value to restore after the timeout. If a Train toast (`"Trained
    // ✓ …"`) is still on-screen when Untrain fires, it would be
    // restored after our own toast times out — making the status claim
    // the model is trained even after a successful reset. Snap back to
    // the canonical "active" text now so flashStatus captures that.
    status.textContent = 'active';

    // Clear only the tfjs snapshot key — leave the rest of the agent's
    // persisted state alone (this is not a full reset). A fresh
    // `construct()` then rehydrates from the bundled baseline.
    try {
      globalThis.localStorage?.removeItem(`agentonomous/${agent.identity.id}/tfjs-network`);
    } catch {
      // localStorage unavailable — the next construct() falls back to
      // the bundled baseline anyway.
    }
    if (sparkline) clearLossSparkline(sparkline);

    const mode = COGNITION_MODES.find((m) => m.id === 'learning');
    if (!mode) {
      untrainBtn.disabled = false;
      untrainBtn.textContent = originalText;
      if (trainBtn) trainBtn.disabled = false;
      return;
    }

    try {
      const reasoner = await mode.construct();
      if (disposed || myEpoch !== changeEpoch) {
        disposeIfOwned(reasoner);
        return;
      }
      const previousReasoner = activeReasoner;
      const previousLearner = activeLearner;
      agent.setReasoner(reasoner);
      activeReasoner = reasoner;
      activeModeId = 'learning';
      disposeIfOwned(previousReasoner);
      // Untrain wipes accumulated buffer too — a "reset to baseline"
      // shouldn't bake the previous run's evidence into the fresh
      // reasoner via flush(). Drop the buffered outcomes via dispose,
      // then rebuild a fresh learner around the new reasoner.
      const learner = await swapLearner('learning', reasoner);
      if (disposed || myEpoch !== changeEpoch) {
        disposeLearner(learner);
        return;
      }
      activeLearner = learner;
      disposeLearner(previousLearner);
      startLearnerReadout();
      flashStatus(status, 'Reset to baseline ✓', TRAINED_FLASH_MS);
    } catch (err) {
      if (disposed || myEpoch !== changeEpoch) return;
      // eslint-disable-next-line no-console -- user-visible diagnostic.
      console.error('cognitionSwitcher: untrain failed', err);
      flashStatus(status, 'Untrain failed', TRAINED_FLASH_MS);
    } finally {
      // Always restore button state so a `dispose()` that races with an
      // in-flight Untrain doesn't leave the DOM stuck on "Resetting…"
      // for the next mount (DOM elements outlive the closure).
      untrainBtn.disabled = false;
      untrainBtn.textContent = originalText;
      if (trainBtn) trainBtn.disabled = false;
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
      stopLearnerReadout();
      disposeLearner(activeLearner);
      activeLearner = null;
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
