import type { Agent, Learner, Reasoner } from 'agentonomous';
import { NoopLearner } from 'agentonomous';
import {
  COGNITION_MODES,
  type CognitionModeSpec,
} from './demo-domain/scenarios/petCare/cognition/index.js';
import {
  buildLearningLearner,
  getIdleThreshold,
  getLastPrediction,
  getLearningBackend,
  serializeTfActivation,
  setLearningBackend,
  SOFTMAX_SKILL_IDS,
} from './demo-domain/scenarios/petCare/cognition/learning.js';
import { clearLossSparkline, renderLossSparkline } from './lossSparkline.js';
import { clearPredictionStrip, renderPredictionStrip } from './predictionStrip.js';

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
 * Number of mood + modifier + event dims appended to the 5 need-level
 * features. Must stay in lockstep with `learning.ts`'s `FEATURE_DIM`
 * (5 + MOOD_KEYS.length + 1 modifier + 3 events = 13). The synthetic
 * Train-button data leaves these 8 dims as uniform `[0, 1]` noise —
 * the labels don't condition on them, so the network learns to ignore
 * them under the synthetic regime. Real in-game data flowing through
 * the `TfjsLearner` reinforcement loop is what teaches the network
 * which of those dims actually predict the right action.
 */
const RICH_FEATURE_DIM_COUNT = 8;

/**
 * Build a synthetic feature vector from the archetype distribution for
 * `skillIdx` (an index into `SOFTMAX_SKILL_IDS`). The Train button uses
 * stratified sampling rather than uniform-random draws so every class
 * sees roughly equal representation in a 30-pair batch — without this,
 * `pet` (`min(needs) > 0.7`) would appear with probability `~0.3^5 ≈
 * 0.24%` and `scold` (`happiness > 0.8 ∧ energy < 0.4`) only ~8%, so
 * the Train button would heavily reinforce the maintenance classes
 * while washing out the under-represented ones.
 *
 * Archetype ranges are designed to land inside the class's region of
 * input space without crossing into a sibling archetype:
 *
 * - feed/clean/play/rest/medicate: target need ∈ [0, 0.3], others ∈
 *   [0.4, 0.95] so `min > 0.7` never fires (`pet` doesn't steal the
 *   sample) and the lowest-need rule resolves correctly.
 * - pet: every need ∈ [0.75, 1.0] so `min > 0.7` fires.
 * - scold: happiness ∈ [0.85, 1.0], energy ∈ [0.0, 0.35], others ∈
 *   [0.4, 0.7] so the `happiness > 0.8 ∧ energy < 0.4` clause fires
 *   before the `min > 0.7` (impossible here) and lowest-need rules.
 *
 * The 8 trailing dims (mood / modifier-count / event-counts) are
 * uniform `[0, 1]` noise — see `RICH_FEATURE_DIM_COUNT` JSDoc.
 */
function generateArchetypeFeatures(rng: () => number, skillIdx: number): number[] {
  const range = (lo: number, hi: number): number => lo + rng() * (hi - lo);
  // Append uniform-noise dims for mood / modifier / event counts. See
  // `RICH_FEATURE_DIM_COUNT` JSDoc for why noise is the right choice
  // for synthetic training pairs.
  const richTail = (): number[] => Array.from({ length: RICH_FEATURE_DIM_COUNT }, () => rng());
  // `pet` — all needs comfortably high.
  if (skillIdx === SOFTMAX_SKILL_IDS.indexOf('pet')) {
    return [
      range(0.75, 1),
      range(0.75, 1),
      range(0.75, 1),
      range(0.75, 1),
      range(0.75, 1),
      ...richTail(),
    ];
  }
  // `scold` — happy + tired.
  if (skillIdx === SOFTMAX_SKILL_IDS.indexOf('scold')) {
    return [
      range(0.4, 0.7),
      range(0.4, 0.7),
      range(0.85, 1),
      range(0, 0.35),
      range(0.4, 0.7),
      ...richTail(),
    ];
  }
  // Maintenance archetypes: target need low, others mid-high.
  const needIdxBySkill: Partial<Record<(typeof SOFTMAX_SKILL_IDS)[number], number>> = {
    feed: 0,
    clean: 1,
    play: 2,
    rest: 3,
    medicate: 4,
  };
  const skillId = SOFTMAX_SKILL_IDS[skillIdx] ?? 'feed';
  const targetNeedIdx = needIdxBySkill[skillId] ?? 0;
  const features: number[] = [];
  for (let i = 0; i < NEED_IDS.length; i++) {
    features.push(i === targetNeedIdx ? range(0, 0.3) : range(0.4, 0.95));
  }
  features.push(...richTail());
  return features;
}

/**
 * Build a one-hot label for class `skillIdx` over `SOFTMAX_SKILL_IDS`.
 */
function oneHotLabel(skillIdx: number): number[] {
  const label = new Array<number>(SOFTMAX_SKILL_IDS.length).fill(0);
  label[skillIdx] = 1;
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
  const predictionStrip = document.getElementById(
    'prediction-strip',
  ) as unknown as SVGSVGElement | null;
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
    // Prediction strip is gated on `learning` mode — clear on leave so
    // a stale distribution doesn't render against a different mode's
    // intent picker.
    if (predictionStrip && !show) clearPredictionStrip(predictionStrip);
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
  let predictionStripUnsubscribe: (() => void) | null = null;
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
   * Subscribe to `AgentTicked` and re-render the prediction strip on
   * every tick while Learning mode is active. Unsubscribe on mode
   * leave (idempotent) so the strip doesn't keep painting on
   * heuristic / bdi / bt ticks.
   */
  const startPredictionStrip = (): void => {
    if (predictionStripUnsubscribe !== null || predictionStrip === null) return;
    const sub = (
      agent as unknown as { subscribe?: (fn: (e: { type: string }) => void) => () => void }
    ).subscribe;
    if (typeof sub !== 'function') return;
    predictionStripUnsubscribe = sub.call(agent, (event: { type: string }) => {
      if (event.type !== 'AgentTicked') return;
      const { output, selectedIdx } = getLastPrediction();
      renderPredictionStrip(predictionStrip, output, {
        threshold: getIdleThreshold(),
        selectedIdx,
      });
    });
  };

  const stopPredictionStrip = (): void => {
    if (predictionStripUnsubscribe !== null) {
      predictionStripUnsubscribe();
      predictionStripUnsubscribe = null;
    }
    if (predictionStrip) clearPredictionStrip(predictionStrip);
  };

  /**
   * Construct the agent's next Stage-8 learner WITHOUT wiring it to the
   * live agent. For learning mode, returns a `TfjsLearner` that
   * batch-trains the supplied reasoner on observed outcomes; for every
   * other mode, returns a fresh `NoopLearner` so accumulated outcomes
   * from the prior mode don't bleed across switches.
   *
   * Wiring is the caller's responsibility — `onChange` calls
   * `maybeSetLearner` only after `agent.setReasoner` has succeeded so a
   * mid-swap reasoner-assignment failure cannot leave the agent with a
   * new learner attached to the previous reasoner.
   */
  const buildLearner = async (
    modeId: CognitionModeSpec['id'],
    reasoner: Reasoner,
  ): Promise<DisposableLearner> => {
    if (modeId === 'learning') {
      return (await buildLearningLearner(agent, reasoner)) as DisposableLearner;
    }
    return new NoopLearner() as DisposableLearner;
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
      // Build the new learner WITHOUT wiring it to the agent yet, so
      // the `await` window between mode.construct() and the commit
      // block leaves the live agent on its previous (reasoner,
      // learner) pair. The original ordering called
      // `agent.setReasoner(NEW)` and then `await buildLearningLearner`
      // before `maybeSetLearner` ran; any AGENT_TICKED firing inside
      // that gap scored outcomes from the new reasoner against the
      // old learner — training observations from the first N ticks
      // after a switch into `learning` mode were silently discarded.
      const learner = await buildLearner(mode.id, reasoner);
      if (disposed || myEpoch !== changeEpoch) {
        disposeLearner(learner);
        disposeIfOwned(reasoner);
        return;
      }
      const previousReasoner = activeReasoner;
      const previousLearner = activeLearner;
      // Atomic commit: setReasoner is sync — if it throws, dispose
      // both the just-built learner and the orphan reasoner before
      // re-throwing so the live agent stays on its previous pair and
      // the outer catch handles the UI rollback. setReasoner +
      // maybeSetLearner must land in the same synchronous block; no
      // tick can be observed between them.
      try {
        agent.setReasoner(reasoner);
      } catch (err) {
        disposeLearner(learner);
        disposeIfOwned(reasoner);
        throw err;
      }
      maybeSetLearner(agent, learner);
      activeReasoner = reasoner;
      activeModeId = mode.id;
      activeLearner = learner;
      disposeIfOwned(previousReasoner);
      disposeLearner(previousLearner);
      status.dataset.mode = mode.id;
      status.textContent = 'active';
      setTrainVisibility(mode.id);
      if (mode.id === 'learning') {
        startLearnerReadout();
        startPredictionStrip();
      } else {
        stopLearnerReadout();
        stopPredictionStrip();
      }
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
      // Stratified sampling: round-robin over the 7 softmax classes so
      // every class gets roughly TRAIN_PAIR_COUNT / 7 samples. Replaces
      // a previous uniform-random sweep that left `pet` (~0.24%) and
      // `scold` (~8%) drastically under-represented in a 30-pair batch.
      const pairs = Array.from({ length: TRAIN_PAIR_COUNT }, (_unused, i) => {
        const skillIdx = i % SOFTMAX_SKILL_IDS.length;
        const features = generateArchetypeFeatures(() => agent.rng.next(), skillIdx);
        return { features, label: oneHotLabel(skillIdx) };
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
      // Untrain wipes accumulated buffer too — a "reset to baseline"
      // shouldn't bake the previous run's evidence into the fresh
      // reasoner via flush(). Build the fresh learner WITHOUT wiring
      // it; the commit pair below applies setReasoner + setLearner
      // atomically so a failure in the former rolls back without
      // leaking the new learner onto the agent.
      const learner = await buildLearner('learning', reasoner);
      if (disposed || myEpoch !== changeEpoch) {
        disposeLearner(learner);
        disposeIfOwned(reasoner);
        return;
      }
      const previousReasoner = activeReasoner;
      const previousLearner = activeLearner;
      try {
        agent.setReasoner(reasoner);
      } catch (err) {
        disposeLearner(learner);
        disposeIfOwned(reasoner);
        throw err;
      }
      maybeSetLearner(agent, learner);
      activeReasoner = reasoner;
      activeModeId = 'learning';
      activeLearner = learner;
      disposeIfOwned(previousReasoner);
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

  const backendPicker = mountBackendPicker(rootEl, {
    // Returns true while Learning is the user's intent — covers
    // both the committed-active case (`activeModeId === 'learning'`)
    // AND the still-loading case where the user has clicked Learning
    // but `mode.construct()` hasn't yet flipped `activeModeId`. Per
    // Codex round 7: a backend change between the click and the
    // construct's settle was previously skipped by this guard, leaving
    // the freshly-constructed reasoner on the snapshotted-at-entry
    // backend (`const backend = selectedBackend` in `learningMode.
    // construct()`) while `setLearningBackend` + localStorage tracked
    // the new pick — picker UI and runtime drift apart until a
    // manual toggle. Triggering reconstruct on the loading case
    // funnels through the existing `changeEpoch` machinery, which
    // discards the stale in-flight construct cleanly.
    isLearningActive: () => activeModeId === 'learning' || select.value === 'learning',
    isDisposed: () => disposed,
    triggerReconstruct: () => {
      void onChange();
    },
  });

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      select.removeEventListener('change', onChangeWrapped);
      if (trainBtn) trainBtn.removeEventListener('click', onTrainClickWrapped);
      if (untrainBtn) untrainBtn.removeEventListener('click', onUntrainClickWrapped);
      backendPicker.dispose();
      disposeIfOwned(activeReasoner);
      activeReasoner = null;
      stopLearnerReadout();
      stopPredictionStrip();
      disposeLearner(activeLearner);
      activeLearner = null;
    },
  };
}

const BACKEND_STORAGE_KEY = 'agentonomous/cognition-backend';
const VALID_BACKENDS = ['cpu', 'wasm', 'webgl'] as const;
type Backend = (typeof VALID_BACKENDS)[number];

function isBackend(s: string): s is Backend {
  return s === 'cpu' || s === 'wasm' || s === 'webgl';
}

type BackendPickerHooks = {
  isLearningActive(): boolean;
  isDisposed(): boolean;
  /**
   * Triggered when the user changes backend AND learning mode is the
   * active cognition mode. Implemented in the switcher closure as a
   * same-mode `onChange()` invocation so the existing concurrent-change
   * + dispose-old-reasoner machinery handles the rebuild.
   */
  triggerReconstruct(): void;
};

type BackendPickerHandle = { dispose(): void };

/**
 * Mount the tfjs backend dropdown next to the cognition picker. On
 * mount: restore the persisted selection (if any), sync it to
 * `learning.ts`'s module-scoped `selectedBackend`, then probe each
 * backend in the background to disable unavailable options. On change:
 * persist + propagate to learning, and force a same-mode reconstruct
 * when learning is the active cognition mode (other modes don't use
 * tfjs, so a reconstruct would just churn).
 *
 * Probes are inquiry-only (`TfjsReasoner.probeBackend` restores the
 * prior backend), so this background sweep doesn't disturb the
 * cognition mode's own `tf.setBackend(...)` selection mid-tick.
 *
 * No-op when `#cognition-backend-select` isn't present in `rootEl` —
 * keeps the demo HTML free to omit the picker (e.g. in a stripped-down
 * embed) without a runtime error.
 */
function mountBackendPicker(rootEl: HTMLElement, hooks: BackendPickerHooks): BackendPickerHandle {
  const backendSelect = rootEl.querySelector<HTMLSelectElement>('#cognition-backend-select');
  if (!backendSelect) return { dispose: (): void => undefined };

  // Read the persisted choice but do NOT propagate it to
  // `selectedBackend` until the async probe validates it. A stale
  // localStorage value (e.g. `'webgl'` from a previous session on a
  // device that no longer has a GL context) would otherwise be
  // applied synchronously, and a fast user click on Learning before
  // the async probe finishes would land in `learningMode.construct()`
  // with an unsupported backend — `fromJSON` rejects with
  // `TfjsBackendNotRegisteredError`, the existing `onChange` catch
  // path disables Learning mode for the rest of the session, and
  // the user can't pick CPU as a recovery.
  let persisted: Backend | null = null;
  try {
    const raw = globalThis.localStorage?.getItem(BACKEND_STORAGE_KEY);
    if (typeof raw === 'string' && isBackend(raw)) persisted = raw;
  } catch {
    // localStorage unavailable — proceed with the cpu default.
  }

  // Seed selectedBackend with `cpu` synchronously. CPU is always
  // registered (the package gates nothing on environment), so any
  // Learning activation that races the probe succeeds. After the
  // probe validates `persisted`, we promote it (and force a same-
  // mode reconstruct when Learning is the active cognition mode so
  // the running reasoner picks up the upgraded backend).
  setLearningBackend('cpu');
  backendSelect.value = persisted ?? 'cpu';
  // Probe-lock: disable the picker until the async startup probe
  // finishes. Without this, a fast user pick during the probe window
  // can fire `onBackendChange` against an unverified backend and
  // (per Codex P1#4) the reconstruct path can disable Learning mode
  // permanently for the session.
  backendSelect.disabled = true;

  void (async (): Promise<void> => {
    try {
      const tf = await import('@tensorflow/tfjs-core');
      // Real activation sweep — sequential because `tf.setBackend` is a
      // global-state mutex. `TfjsReasoner.probeBackend` (registry-only)
      // can't tell us whether `@tensorflow/tfjs-backend-wasm@4.22` will
      // actually initialize on this device — its factory registers
      // unconditionally but throws at first use under runtime
      // constraints. Per Codex P1 round 6, deciding `finalBackend` from
      // a registry-only result lets a stale `'wasm'` persist through to
      // `learningMode.construct()`, which then fails and disables
      // Learning for the session. Doing the activation here, while no
      // reasoner exists, makes the disabled-option UX accurate AND
      // gates the persisted-promotion on real availability.
      //
      // Each iteration: side-effect-import the matching backend
      // package (literal-string `import()` so Vite can code-split),
      // try `tf.setBackend(name)`, record the boolean. Throws are
      // caught and treated as unavailable.
      const probeResults: { readonly name: Backend; readonly ok: boolean }[] = [];
      for (const name of VALID_BACKENDS) {
        // Serialize each iteration's `tf.setBackend` through the
        // shared mutex so a `learningMode.construct()` triggered by
        // a fast user click on Learning can't interleave with the
        // probe sweep — without this, the probe loop can flip
        // `tf.backend` between `fromJSON`'s internal `tf.setBackend`
        // and `new TfjsReasoner`'s constructor check, which throws
        // `TfjsBackendNotRegisteredError` and disables Learning for
        // the session (Codex P1 round 9).
        const ok = await serializeTfActivation(async (): Promise<boolean> => {
          try {
            switch (name) {
              case 'cpu':
                await import('@tensorflow/tfjs-backend-cpu');
                break;
              case 'wasm':
                await import('@tensorflow/tfjs-backend-wasm');
                break;
              case 'webgl':
                await import('@tensorflow/tfjs-backend-webgl');
                break;
            }
            const result = await tf.setBackend(name);
            if (result) await tf.ready();
            return result;
          } catch {
            return false;
          }
        });
        if (hooks.isDisposed()) return;
        probeResults.push({ name, ok });
      }

      for (const { name, ok } of probeResults) {
        const opt = backendSelect.querySelector<HTMLOptionElement>(`option[value="${name}"]`);
        if (!opt) continue;
        if (ok) {
          opt.disabled = false;
          opt.removeAttribute('title');
        } else {
          opt.disabled = true;
          opt.title = `${name.toUpperCase()} unavailable in this browser`;
        }
      }

      // Validate the LIVE selection — not just the persisted value.
      // Two distinct races live here:
      //
      // 1. Persisted-but-broken (e.g. `'webgl'` from a previous
      //    session on a device that no longer has GL). Pre-probe we
      //    seeded `selectedBackend = 'cpu'` synchronously, so any
      //    Learning activation that races the probe is safe.
      // 2. User picks a backend during the probe window. The
      //    `onBackendChange` listener has already called
      //    `setLearningBackend(...)` + persisted it, but the probe
      //    may now report that pick as unavailable. The earlier
      //    "persisted-only" check here would miss this — `persisted`
      //    is null and the post-probe path leaves
      //    `selectedBackend` pointing at the broken pick.
      //
      // The live `<select>` value reflects BOTH cases (it carries
      // the user's intent if changed, or the pre-probe seed
      // otherwise). Validating it post-probe + reverting to `cpu`
      // on failure handles both races uniformly.
      const liveRaw = backendSelect.value;
      const liveValue: Backend = isBackend(liveRaw) ? liveRaw : 'cpu';
      const liveOk =
        liveValue === 'cpu' || (probeResults.find((r) => r.name === liveValue)?.ok ?? false);
      const finalBackend: Backend = liveOk ? liveValue : 'cpu';
      if (backendSelect.value !== finalBackend) backendSelect.value = finalBackend;
      // Commit `finalBackend` as the active tf backend. The probe loop
      // above leaves tf on whichever name was last successful (last in
      // iteration order — typically `webgl` in browsers), which may
      // differ from what the user actually wants. A subsequent
      // `learningMode.construct()` would self-commit via
      // `fromJSON({ backend })`, but doing it here keeps tf state
      // consistent with the picker's reported selection between mount
      // and the next mode change.
      if (tf.getBackend() !== finalBackend) {
        await serializeTfActivation(async (): Promise<void> => {
          try {
            await tf.setBackend(finalBackend);
            await tf.ready();
          } catch {
            // cpu commit shouldn't fail; if it does we leave tf wherever
            // the loop ended and let learningMode.construct() retry.
          }
        });
      }
      if (getLearningBackend() !== finalBackend) {
        setLearningBackend(finalBackend);
        // If Learning was already selected during the probe window,
        // force a same-mode reconstruct so the in-flight reasoner
        // picks up the corrected (or upgraded) backend.
        if (hooks.isLearningActive()) hooks.triggerReconstruct();
      }
      try {
        globalThis.localStorage?.setItem(BACKEND_STORAGE_KEY, finalBackend);
      } catch {
        // localStorage unavailable — selection still applied for this session.
      }
    } catch {
      // Adapter import failed (peer dep missing). Leave all options
      // enabled; if the user actually selects Learning mode, the mode's
      // own probe surfaces the missing dep. selectedBackend stays at
      // 'cpu' so Learning still has a viable activation path.
    } finally {
      // Release the probe-lock regardless of probe outcome — without
      // this a thrown adapter import would leave the picker frozen
      // for the session.
      if (!hooks.isDisposed()) backendSelect.disabled = false;
    }
  })();

  // Monotonic counter incremented on every `change` event. Each
  // in-flight `onBackendChange` invocation captures the current
  // value into `myEpoch` before any `await`; after each await it
  // re-checks the latest counter and bails if a newer change has
  // started. Without this guard, rapid sequential picks can complete
  // out of order — an earlier-but-slower `tf.setBackend` activation
  // lands AFTER a newer user choice and overwrites both
  // `setLearningBackend(...)` and localStorage with the stale value.
  // Mirrors the `changeEpoch` pattern in the cognition-mode
  // `onChange` handler above.
  let backendChangeEpoch = 0;
  // The shared `serializeTfActivation` mutex (in `cognition/learning.ts`)
  // already coordinates `onBackendChange`'s `tf.setBackend` with the
  // startup probe sweep AND `learningMode.construct()`. Any stale
  // handler that woke up AFTER a newer change will see
  // `myEpoch !== backendChangeEpoch` BEFORE its `setBackend` and
  // bail without mutating tf state, eliminating the out-of-order
  // race Codex flagged in round 8 — and the round-9 race between
  // this handler and `mode.construct()`.
  const onBackendChange = async (): Promise<void> => {
    if (hooks.isDisposed()) return;
    const value = backendSelect.value;
    if (!isBackend(value)) return;
    const myEpoch = ++backendChangeEpoch;
    const activated = await serializeTfActivation(async (): Promise<boolean> => {
      // Re-check epoch + dispose AFTER the serialization wait. A
      // newer change may have arrived while we queued; if so, bail
      // before any tf mutation rather than executing a stale
      // `setBackend` that the next handler would have to undo.
      if (hooks.isDisposed() || myEpoch !== backendChangeEpoch) return false;
      // Verify activation BEFORE asking the cognition switcher to
      // reconstruct. `probeBackend` (the registry-only probe used by
      // mountBackendPicker's startup sweep) cannot detect runtime
      // false-positives — `@tensorflow/tfjs-backend-wasm@4.22`
      // registers its factory unconditionally, but the factory
      // itself can throw at first use (no fetch shim, WebAssembly
      // disabled). Without an activation check here, that bad pick
      // would propagate to `mode.construct()`, `fromJSON` would
      // reject with `TfjsBackendNotRegisteredError`, the existing
      // `onChange` catch path would disable Learning mode for the
      // rest of the session, and the user would have no way to
      // recover short of a reload.
      const tf = await import('@tensorflow/tfjs-core');
      // Snapshot the prior backend INSIDE the mutex so it can't shift
      // between this read and the restore below. A failed
      // `tf.setBackend(value)` can leave tfjs without a usable active
      // backend (Codex P1 round 11) — restore the snapshot in the
      // failure branch so a Learning-mode reasoner that was happily
      // running on the prior backend doesn't start failing on the
      // next tick. Mirrors the all-failed restore in
      // `TfjsReasoner.detectBestBackend`.
      const prior = tf.getBackend();
      try {
        const ok = await tf.setBackend(value);
        if (ok) {
          await tf.ready();
          return true;
        }
      } catch {
        // Fall through to restore.
      }
      if (prior !== '' && prior !== value) {
        try {
          await tf.setBackend(prior);
          await tf.ready();
        } catch {
          // Best-effort — surfacing as a separate error here would
          // mask the more useful "this backend is unavailable" UX
          // signal the caller already handles below.
        }
      }
      return false;
    });
    // Post-activation stale guard: even with serialization, a
    // newer change can arrive between our setBackend completing
    // and our commit running. The newer handler will own the
    // commit; we bail.
    if (hooks.isDisposed() || myEpoch !== backendChangeEpoch) return;
    if (!activated) {
      // Mark the failing option disabled so a future pick can't hit
      // the same path, revert the picker to whichever backend is
      // still believed-good (the in-flight `selectedBackend`), and
      // skip persistence — the bad value never reaches localStorage.
      const failingOpt = backendSelect.querySelector<HTMLOptionElement>(`option[value="${value}"]`);
      if (failingOpt) {
        failingOpt.disabled = true;
        failingOpt.title = `${value.toUpperCase()} unavailable in this browser`;
      }
      const fallback = getLearningBackend();
      backendSelect.value = isBackend(fallback) ? fallback : 'cpu';
      return;
    }
    setLearningBackend(value);
    try {
      globalThis.localStorage?.setItem(BACKEND_STORAGE_KEY, value);
    } catch {
      // localStorage unavailable — selection still applies for this session.
    }
    if (hooks.isLearningActive()) {
      hooks.triggerReconstruct();
    }
  };
  const onBackendChangeWrapped = (): void => {
    void onBackendChange();
  };
  backendSelect.addEventListener('change', onBackendChangeWrapped);

  return {
    dispose(): void {
      backendSelect.removeEventListener('change', onBackendChangeWrapped);
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
