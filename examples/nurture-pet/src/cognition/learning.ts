import type { Agent, Learner, LearningOutcome, Reasoner, ReasonerContext } from 'agentonomous';
import type { CognitionModeSpec } from './index.js';
import networkJson from './learning.network.json';

/**
 * Buffer size before TfjsLearner kicks off a background train. Picked so a
 * casually-played session sees its first reinforcement update within ~1
 * minute of activity at default speed; small enough that the post-train
 * weight drift is observable in the trace view.
 */
const LEARNER_BATCH_SIZE = 50;

/**
 * Active-care skill ids the softmax output is indexed over. Order is
 * load-bearing: it matches the bundled `learning.network.json` baseline's
 * column order AND the one-hot label order used by both the `Train`
 * button's synthetic dataset (`cognitionSwitcher.ts`) and the seed
 * script (`scripts/seed-learning-network.ts`). Changing the ordering
 * silently breaks every previously-trained snapshot — bump baseline +
 * tests in lockstep.
 *
 * Expression skills (`meow` / `sad` / `sleepy`) intentionally stay in
 * the heuristic-reactive layer (NeedsPolicy) rather than the softmax —
 * they're emoted reflexively from need state, not deliberately chosen,
 * so a learning-mode argmax over them would conflict with the always-on
 * heuristic emission. Plan open-question 2, resolved in row 17.
 */
export const SOFTMAX_SKILL_IDS = [
  'feed',
  'clean',
  'play',
  'rest',
  'pet',
  'medicate',
  'scold',
] as const;

/** Number of softmax outputs — matches `SOFTMAX_SKILL_IDS.length`. */
const SOFTMAX_DIM = SOFTMAX_SKILL_IDS.length;

/**
 * Mood categories surfaced as one-hot dims in the feature vector.
 * Order is load-bearing — matches the bundled baseline + Train button
 * generator. Off-roster moods (`content`, `angry`, `bored`, `sick`, …)
 * collapse to the all-zero one-hot. Picked to cover the four most
 * narratively-distinct demo states; richer mood encoding can grow this
 * roster in lockstep with the seed script + tests.
 */
const MOOD_KEYS = ['happy', 'sad', 'sleepy', 'playful'] as const;

/**
 * Sliding window (in `AgentTicked` ticks) over which `featuresFromNeeds`
 * counts `SkillCompleted` / `SkillFailed` / `NeedCritical` events. 30
 * ticks ≈ 30 × default 200 ms tick budget = 6 s of subjective-time
 * activity at base speed.
 */
const EVENT_WINDOW_TICKS = 30;

/**
 * Cap used to normalize event counts and modifier counts into [0, 1].
 * Counts above this saturate to 1.0 — five completions / failures /
 * criticals / active modifiers in a 30-tick window is already
 * exceptional in the demo's pacing, so the cap is the right ceiling.
 */
const COUNT_NORM_CAP = 5;

/**
 * Input feature width: 5 needs + 4 mood one-hot + 1 modifier-count + 3
 * recent-event counts = 13. Hydration rejects snapshots whose model's
 * input layer expects a different last-dim so a width mismatch fails
 * fast at construct() rather than at runtime when `model.predict` first
 * receives a 13-element vector.
 */
const FEATURE_DIM = 5 + MOOD_KEYS.length + 1 + 3;

/**
 * Idle floor for the learning-mode `interpret()` gate. The network's
 * softmax output is a probability distribution over the 7 active-care
 * skills — when the max probability sits below this floor the pet idles
 * this tick rather than commit an intention. A uniform distribution over
 * 7 skills sits at ~0.143; an untrained network with biased weights
 * tends to sit only slightly above that. The floor is picked so the
 * post-train idle rate stays observably different from the untrained
 * baseline. Tune up (toward 0.4) if the post-train idle rate is
 * indistinguishable from the baseline; tune down (toward 0.15) if the
 * pet rarely acts.
 */
const IDLE_THRESHOLD = 0.2;

/**
 * Read-only accessor for `IDLE_THRESHOLD`. Exposed so the prediction
 * strip can render the threshold line without re-deriving the demo's
 * tuning constant. Direct re-export of the constant is avoided to
 * keep the value as the single source of truth.
 */
export function getIdleThreshold(): number {
  return IDLE_THRESHOLD;
}

/**
 * Module-scoped agent id used as the localStorage key scope when
 * hydrating the trained network. Set by `setLearningAgent` from
 * `main.ts` after the agent is created. Kept module-scoped (rather
 * than widening `CognitionModeSpec.construct(agentId)`) because no
 * other mode needs agent-id scoping.
 */
let agentIdForHydration: string | null = null;

/**
 * Module-scoped tfjs backend used by `learningMode.construct()`. The
 * cognition switcher's backend picker writes this via
 * `setLearningBackend` before triggering a reconstruct so the next
 * `construct()` registers the chosen backend (and its tfjs package
 * lazy-import) and asks `TfjsReasoner.fromJSON` to commit it.
 *
 * Defaults to `'cpu'` so the first construct after a cold load matches
 * the determinism-preserving baseline. The picker overrides this on
 * mount from the persisted value (or `TfjsReasoner.detectBestBackend`)
 * before any user-driven reconstruct fires.
 */
let selectedBackend: 'cpu' | 'wasm' | 'webgl' = 'cpu';

/**
 * Set the tfjs backend the next `learningMode.construct()` will request.
 * Called by the cognition switcher's backend picker; learning mode reads
 * this when rebuilding its `TfjsReasoner` from the persisted snapshot or
 * the bundled baseline.
 */
export function setLearningBackend(name: 'cpu' | 'wasm' | 'webgl'): void {
  selectedBackend = name;
}

/**
 * Read the current selection — exposed so the picker can sync its
 * `<select>` value on mount without re-reading localStorage.
 */
export function getLearningBackend(): 'cpu' | 'wasm' | 'webgl' {
  return selectedBackend;
}

/**
 * Module-scoped recent state used by `featuresFromNeeds` to build the
 * mood / modifier-count / event-count dims. Populated via the agent
 * subscription wired up in `setLearningAgent`. Kept module-scoped so
 * the consumer-supplied `featuresOf` callback (which only receives
 * `ReasonerContext` + `helpers`) can read it without widening the
 * adapter's helpers shape.
 */
let currentMood: string | null = null;
let currentTick = 0;
type RecentEventKind = 'completed' | 'failed' | 'critical';
let recentEvents: Array<{ tick: number; kind: RecentEventKind }> = [];
let unsubscribers: Array<() => void> = [];

/**
 * Last softmax probability vector observed by the consumer-supplied
 * `interpret` callback. Captured as a side effect so the demo's
 * prediction strip can render the same distribution that drove this
 * tick's argmax / idle decision without re-running a forward pass.
 * `null` until the first reasoner-driven `selectIntention` of a
 * Learning-mode session.
 */
let lastPrediction: number[] | null = null;

/**
 * Index of the column `interpretSoftmax` selected on the most recent
 * call, or `null` when the pet idled. Tracked alongside
 * `lastPrediction` so the strip can highlight the chosen action even
 * though `interpret` only returns the resulting `Intention`.
 */
let lastSelectedIdx: number | null = null;

/**
 * Read the most recent softmax distribution + selected column. Used
 * by the demo's prediction strip; the tuple is `[output, selectedIdx]`
 * so a single call returns both halves.
 */
export function getLastPrediction(): { output: number[] | null; selectedIdx: number | null } {
  return { output: lastPrediction, selectedIdx: lastSelectedIdx };
}

/**
 * Record one completion / failure outcome into the recent-event window.
 * Called by `buildLearningLearner`'s `toTrainingPair` wrapper AFTER
 * `projectLearningOutcome` finishes — that ordering keeps the projection
 * looking at pre-this-outcome counts (the kernel's own emission is
 * scored once, not double-counted via the SkillCompleted bus).
 *
 * Counting via the learner's own outcome stream rather than via
 * `agent.subscribe('SkillCompleted')` sidesteps two failure modes the
 * earlier event-subscription approach had:
 * 1. Default skills that emit `SkillCompleted` from `execute()` (e.g.
 *    `FeedSkill`) PLUS the kernel's emission from
 *    `CognitionPipeline.invokeSkillAction` would double-count.
 * 2. `Agent.dispatchReactiveHandlers` can process two queued
 *    `InteractionRequested` events in one tick, legitimately invoking
 *    the same skill twice; per-tick `${kind}:${skillId}` dedupe would
 *    drop the second. Counting via outcomes captures BOTH (one outcome
 *    is scored per kernel invocation).
 */
export function recordOutcomeForFeatureWindow(kind: 'completed' | 'failed'): void {
  recentEvents.push({ tick: currentTick, kind });
}

/**
 * Wire the learning mode to `agent`: store its id for the persisted-
 * network localStorage scope AND subscribe to the standard event bus
 * to feed the mood + tick-window state of `featuresFromNeeds`. Pass
 * `null` to tear down (idempotent).
 *
 * The subscription tracks:
 * - `MoodChanged` → `currentMood` (collapsed to one-hot via `MOOD_KEYS`)
 * - `AgentTicked` → `currentTick` and prunes events older than
 *   `EVENT_WINDOW_TICKS`
 * - `NeedCritical` → push into `recentEvents` (single-source emission
 *   from `NeedsTicker`, no dedupe needed)
 *
 * `SkillCompleted` / `SkillFailed` are NOT subscribed here — they're
 * counted via `recordOutcomeForFeatureWindow` from the learner's
 * outcome stream so kernel + skill double-emits and reactive-handler
 * back-to-back invocations both produce exactly one count per
 * invocation.
 */
export function setLearningAgent(
  agent: {
    identity: { id: string };
    subscribe(handler: (e: { type: string }) => void): () => void;
  } | null,
): void {
  for (const u of unsubscribers) u();
  unsubscribers = [];
  currentMood = null;
  currentTick = 0;
  recentEvents = [];
  lastPrediction = null;
  lastSelectedIdx = null;
  agentIdForHydration = agent?.identity.id ?? null;
  if (agent === null) return;
  unsubscribers.push(
    agent.subscribe((event) => {
      switch (event.type) {
        case 'MoodChanged': {
          const e = event as { to?: string };
          if (typeof e.to === 'string') currentMood = e.to;
          return;
        }
        case 'AgentTicked': {
          const e = event as { tickNumber?: number };
          if (typeof e.tickNumber === 'number') {
            currentTick = e.tickNumber;
            const cutoff = currentTick - EVENT_WINDOW_TICKS;
            // Prune in place — `recentEvents` is append-then-filter so
            // a per-tick scan is O(window) and stable.
            recentEvents = recentEvents.filter((r) => r.tick > cutoff);
          }
          return;
        }
        case 'NeedCritical': {
          recentEvents.push({ tick: currentTick, kind: 'critical' });
          return;
        }
      }
    }),
  );
}

function storageKey(agentId: string): string {
  return `agentonomous/${agentId}/tfjs-network`;
}

function loadPersistedSnapshot(agentId: string | null): unknown {
  if (agentId === null) return null;
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(agentId));
    if (typeof raw !== 'string' || raw.length === 0) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Build the 13-dim feature vector consumed by Learning mode's network:
 *
 * - 5 need levels (hunger / cleanliness / happiness / energy / health)
 * - 4 mood one-hot dims indexed by `MOOD_KEYS` (off-roster moods → all
 *   zero on this section; the network treats it as "uninformative")
 * - 1 active-modifier count, normalized to `[0, 1]` via
 *   `min(count, COUNT_NORM_CAP) / COUNT_NORM_CAP`
 * - 3 recent-event counts (`SkillCompleted` / `SkillFailed` /
 *   `NeedCritical` in the last `EVENT_WINDOW_TICKS` ticks), each
 *   normalized via the same cap
 *
 * Mood + event counts come from module-scoped state populated by the
 * `setLearningAgent` subscription rather than via `helpers` — the
 * adapter's helper shape only exposes `needsLevels()`, and widening
 * that surface for one consumer would force every reasoner adapter to
 * track per-agent mood + event windows.
 */
function featuresFromNeeds(
  ctx: ReasonerContext,
  helpers: { needsLevels(): Record<string, number> },
): number[] {
  const levels = helpers.needsLevels();
  const moodOneHot = MOOD_KEYS.map((key) => (currentMood === key ? 1 : 0));
  const modCount = Math.min(ctx.modifiers.list().length, COUNT_NORM_CAP) / COUNT_NORM_CAP;
  let completed = 0;
  let failed = 0;
  let critical = 0;
  for (const e of recentEvents) {
    if (e.kind === 'completed') completed += 1;
    else if (e.kind === 'failed') failed += 1;
    else critical += 1;
  }
  const norm = (n: number): number => Math.min(n, COUNT_NORM_CAP) / COUNT_NORM_CAP;
  return [
    levels.hunger ?? 0,
    levels.cleanliness ?? 0,
    levels.happiness ?? 0,
    levels.energy ?? 0,
    levels.health ?? 0,
    ...moodOneHot,
    modCount,
    norm(completed),
    norm(failed),
    norm(critical),
  ];
}

/**
 * Pick the highest-probability skill from the softmax output. Returns
 * an `Intention | null` per the `Reasoner.selectIntention` contract:
 *
 * - `null` when the max probability is below `IDLE_THRESHOLD` (the pet
 *   idles this tick — observably different idle rates between trained
 *   and untrained networks make the training visible in the demo).
 * - `{ kind: 'satisfy', type: <skillId> }` otherwise, where `<skillId>`
 *   is `SOFTMAX_SKILL_IDS[argmax(output)]`.
 *
 * The heuristic candidate fallback that the previous scalar-urgency
 * gate used has retired — once the network has a positive-probability
 * column for any active-care skill, the softmax IS the policy.
 *
 * Exported for unit tests (a hand-crafted `output` vector should pick
 * `argmax` correctly and respect the idle floor) — module-scoped
 * helpers usually wouldn't be exported but the contract is small enough
 * that documenting it via a test is cheaper than re-deriving it.
 */
/**
 * Argmax index over a softmax vector. Returns `0` for empty / single-
 * element inputs (the strip never runs in those cases — guarded above
 * — but the function is total to keep callers branch-free).
 */
function argmaxIndex(output: readonly number[]): number {
  let maxIdx = 0;
  let maxVal = output[0] ?? 0;
  for (let i = 1; i < output.length; i++) {
    const v = output[i] ?? 0;
    if (v > maxVal) {
      maxVal = v;
      maxIdx = i;
    }
  }
  return maxIdx;
}

export function interpretSoftmax(output: number[]): import('agentonomous').Intention | null {
  // Defensive width check: a snapshot whose model emits a different
  // output dimension is rejected at `construct()` (see hydrate below),
  // so this branch is only reachable if the adapter contract drifts in
  // the future. Idle rather than `?? 0`-pad: a silent pad biases the
  // argmax toward column 0 (`feed`).
  if (output.length !== SOFTMAX_DIM) return null;
  let maxIdx = 0;
  let maxVal = output[0] ?? 0;
  for (let i = 1; i < SOFTMAX_DIM; i++) {
    const v = output[i] ?? 0;
    if (v > maxVal) {
      maxVal = v;
      maxIdx = i;
    }
  }
  if (maxVal < IDLE_THRESHOLD) return null;
  const skillId = SOFTMAX_SKILL_IDS[maxIdx];
  if (skillId === undefined) return null;
  return { kind: 'satisfy', type: skillId };
}

/**
 * Learning mode. On `construct()`, hydrates the TfjsReasoner from the
 * browser-local persisted snapshot if present, falling back to the
 * bundled `learning.network.json` baseline. The Train button in the
 * switcher calls `reasoner.train(...)` and persists `reasoner.toJSON()`.
 *
 * `interpret()` argmaxes the network's 7-way softmax output over the
 * active-care skills and idles the pet whenever the top probability
 * drops below `IDLE_THRESHOLD`. Trained and untrained networks thus
 * produce different intention streams and idle rates, making training
 * observable in the trace view.
 *
 * `construct()` side-effect-imports `@tensorflow/tfjs-backend-cpu` so
 * the backend is registered lazily — only when the user actually
 * switches to this mode.
 */
export const learningMode: CognitionModeSpec = {
  id: 'learning',
  label: 'Learning (tfjs)',
  peerName: '@tensorflow/tfjs-core',
  async probe(): Promise<boolean> {
    try {
      await import('@tensorflow/tfjs-core');
      await import('@tensorflow/tfjs-layers');
      return true;
    } catch {
      return false;
    }
  },
  async construct(): Promise<Reasoner> {
    // Snapshot `selectedBackend` at entry: the picker (running on
    // a different microtask via its `change` listener) can flip
    // module-scoped `selectedBackend` between any two `await`s
    // below, so a naïve re-read at `fromJSON` time could ask for
    // backend B when this function imported the package for
    // backend A — `fromJSON` would then reject with
    // `TfjsBackendNotRegisteredError` and `cognitionSwitcher`'s
    // catch path would disable Learning mode for the rest of the
    // session. Holding the snapshot for the full construct keeps
    // import + activation aligned to one backend.
    const backend = selectedBackend;
    // Side-effect-import the package matching the snapshotted
    // backend. Each branch uses a literal string so Vite's static
    // analysis can emit a per-backend async chunk; passing
    // `backend` to a computed `import()` would inline all three
    // packages into the learning chunk (or fail at build time).
    switch (backend) {
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
    const tf = await import('@tensorflow/tfjs-core');
    const { TfjsReasoner } = await import('agentonomous/cognition/adapters/tfjs');
    type Snapshot = Parameters<typeof TfjsReasoner.fromJSON>[0];

    const persisted = loadPersistedSnapshot(agentIdForHydration);
    const seed: Snapshot = (persisted ?? networkJson) as Snapshot;

    const hydrate = async (snap: Snapshot): Promise<Reasoner> => {
      const r = await TfjsReasoner.fromJSON<number[], number[]>(snap, {
        backend,
        featuresOf: featuresFromNeeds,
        interpret: (output) => {
          // Side-effect: snapshot the per-tick distribution + chosen
          // column so the demo's prediction strip can render the same
          // numbers `interpretSoftmax` argmaxed without re-running a
          // forward pass. `interpretSoftmax` returns `null` for both
          // shape mismatches and below-threshold idles; pair the
          // capture with an explicit argmax pass so the strip can
          // distinguish "idle because below threshold" (output is
          // valid, selected is null) from "idle because invalid"
          // (output stays null).
          if (output.length === SOFTMAX_DIM) {
            lastPrediction = [...output];
            const intent = interpretSoftmax(output);
            lastSelectedIdx = intent === null ? null : argmaxIndex(output);
            return intent;
          }
          lastPrediction = null;
          lastSelectedIdx = null;
          return interpretSoftmax(output);
        },
      });
      // Reject snapshots whose output OR input dimension doesn't match
      // the bundled topology. A pre-row-17 snapshot (single sigmoid
      // output, length 1) loads fine through `fromJSON` but its scalar
      // urgency bears no resemblance to a 7-way softmax — silently
      // treating `output[0]` as the `feed` probability would produce a
      // "trained" pet that always feeds whenever the old scalar
      // exceeded the idle floor. Likewise an output-7 snapshot whose
      // input layer expects a different last-dim would only blow up at
      // runtime when `featuresFromNeeds` first hands it a 5-element
      // vector — Learning mode would then throw on every intention
      // selection instead of falling back to the baseline. Throw on
      // either mismatch so the caller falls back to the bundled
      // baseline.
      const model = r.getModel();
      const outShape = model.outputs[0]?.shape;
      const outLastDim = outShape && outShape.length > 0 ? outShape[outShape.length - 1] : null;
      const inShape = model.inputs[0]?.shape;
      const inLastDim = inShape && inShape.length > 0 ? inShape[inShape.length - 1] : null;
      if (outLastDim !== SOFTMAX_DIM || inLastDim !== FEATURE_DIM) {
        // Free the rebuilt-but-incompatible model's tensors before the
        // catch path constructs the bundled baseline. Without this,
        // re-entering Learning mode with an incompatible persisted
        // snapshot would leak one tfjs model + its weight tensors per
        // attempt.
        r.dispose();
        throw new Error(
          `learning: persisted snapshot has shape [${String(inLastDim)}, ${String(outLastDim)}], expected [${FEATURE_DIM}, ${SOFTMAX_DIM}] — rebuilding from bundled baseline.`,
        );
      }
      // The rebuilt Sequential ships uncompiled; compile with a default
      // SGD + categoricalCrossentropy pair so the Train button can call
      // `r.train(...)` over the 7-way softmax output.
      r.getModel().compile({ optimizer: tf.train.sgd(0.1), loss: 'categoricalCrossentropy' });
      return r;
    };

    try {
      return await hydrate(seed);
    } catch {
      return hydrate(networkJson as Snapshot);
    }
  },
};

/**
 * Project a `LearningOutcome` from the cognition pipeline's Stage 8 hook
 * into a 13-dim `(features, oneHotLabel)` training pair matching the
 * bundled `learning.network.json` topology.
 *
 * - Need-level dims = `details.preNeeds` snapshot — the pre-skill need
 *   levels captured by `CognitionPipeline.invokeSkillAction` BEFORE the
 *   skill runs. Reading post-skill levels (e.g. via
 *   `agent.getState().needs` right now) would invert the policy
 *   direction: `feed` raises hunger from low → high, so a label of
 *   "feed" against post-feed features trains the network on "high
 *   hunger → feed" instead of the intended "low hunger → feed". Falls
 *   back to current `agent.getState().needs` only if the outcome
 *   arrived without a `preNeeds` snapshot, for defensive compatibility
 *   with consumer-emitted outcomes (the library's own pipeline always
 *   populates it).
 * - Mood dim = current `agent.getState().mood?.category`. `MoodModel`
 *   reconciles at Stage 2.7 of every tick, BEFORE Stage 7 skill
 *   execution and Stage 8 scoring, so mood at outcome time still
 *   reflects pre-skill state for any single-skill invocation.
 * - Modifier-count dim = `details.preModifierCount` (snapshotted by
 *   `CognitionPipeline.invokeSkillAction` BEFORE skill execution).
 *   Reading `agent.getState().modifiers.length` here would leak
 *   skill-applied mutations (e.g. `FeedSkill` adds `well-fed`,
 *   `CleanSkill` removes `dirty`). Falls back to current state only
 *   when the outcome arrived without the snapshot (e.g. a consumer-
 *   emitted outcome from outside the kernel).
 * - Event-count dims = current `recentEvents` window. THIS outcome's
 *   own completion is NOT yet recorded — `buildLearningLearner`'s
 *   `toTrainingPair` wrapper increments AFTER `projectLearningOutcome`
 *   returns, so the projection always sees pre-this-outcome counts.
 * - Label = one-hot 7-vector for SUCCESSFUL outcomes only. Successes
 *   for skill `id` set `label[SOFTMAX_SKILL_IDS.indexOf(id)] = 1`.
 *
 * Returns `null` for:
 * - Outcomes whose intention is outside the 7-skill softmax index
 *   (e.g. an `express` intention from the heuristic-reactive layer).
 * - **Failed outcomes.** An all-zero target under
 *   `categoricalCrossentropy` (`-Σ y_i log p_i`) yields zero loss and
 *   zero gradient — the network would silently ignore failure samples,
 *   so the buffer slot is wasted. Skipping them keeps the loss honest.
 * - Successes with non-positive or non-finite `effectiveness`.
 */
function projectLearningOutcome(
  agent: Agent,
  outcome: LearningOutcome,
): { features: number[]; label: number[] } | null {
  const intentionType = outcome.intention.type;
  if (typeof intentionType !== 'string') return null;
  const skillIdx = SOFTMAX_SKILL_IDS.indexOf(intentionType as (typeof SOFTMAX_SKILL_IDS)[number]);
  if (skillIdx < 0) return null;

  const details = outcome.details ?? {};
  const failed = (details as { failed?: unknown }).failed === true;
  // Skip failed outcomes — see JSDoc above for the categoricalCrossentropy
  // zero-loss reasoning.
  if (failed) return null;

  const eff = (details as { effectiveness?: unknown }).effectiveness;
  if (typeof eff !== 'number' || !Number.isFinite(eff) || eff <= 0) return null;

  // Prefer the pre-skill snapshot the pipeline captured before the skill
  // mutated state; fall back to the live snapshot only when the outcome
  // arrived without one. See JSDoc above for why post-skill features
  // would invert the training direction.
  const preNeeds = (details as { preNeeds?: Record<string, number> }).preNeeds;
  const levels = preNeeds ?? agent.getState().needs;
  const state = agent.getState();
  const moodCategory = state.mood?.category;
  const moodOneHot = MOOD_KEYS.map((key) => (moodCategory === key ? 1 : 0));
  // Prefer the kernel-supplied pre-skill modifier count; fall back to
  // current state only for consumer-emitted outcomes that bypass the
  // pipeline's snapshot.
  const preModCountRaw = (details as { preModifierCount?: unknown }).preModifierCount;
  const preModCount =
    typeof preModCountRaw === 'number' && Number.isFinite(preModCountRaw)
      ? preModCountRaw
      : state.modifiers.length;
  const modCount = Math.min(preModCount, COUNT_NORM_CAP) / COUNT_NORM_CAP;
  let completed = 0;
  let failedCount = 0;
  let critical = 0;
  for (const e of recentEvents) {
    if (e.kind === 'completed') completed += 1;
    else if (e.kind === 'failed') failedCount += 1;
    else critical += 1;
  }
  const norm = (n: number): number => Math.min(n, COUNT_NORM_CAP) / COUNT_NORM_CAP;
  const features = [
    levels.hunger ?? 0,
    levels.cleanliness ?? 0,
    levels.happiness ?? 0,
    levels.energy ?? 0,
    levels.health ?? 0,
    ...moodOneHot,
    modCount,
    norm(completed),
    norm(failedCount),
    norm(critical),
  ];
  const label = new Array<number>(SOFTMAX_DIM).fill(0);
  label[skillIdx] = 1;
  return { features, label };
}

/**
 * Build the Learning-mode reinforcement learner. Dynamically imports the
 * tfjs adapter so the peer dep stays out of the main bundle until the
 * learning mode is selected.
 *
 * The returned learner buffers `LearningOutcome`s scored by Stage 8 of
 * the cognition pipeline, batch-trains the supplied reasoner every
 * `LEARNER_BATCH_SIZE` outcomes in the background, and stays out of the
 * tick loop's critical path. Ownership transfers to the caller — call
 * `dispose()` (or `flush()` first) before discarding.
 */
export async function buildLearningLearner(
  agent: Agent,
  reasoner: Reasoner,
): Promise<Learner & { bufferedCount(): number; isTraining(): boolean; dispose(): void }> {
  const { TfjsLearner } = await import('agentonomous/cognition/adapters/tfjs');
  // The `Reasoner` interface is the type-system contract the switcher
  // tracks; the runtime instance from `learningMode.construct()` is a
  // `TfjsReasoner` and exposes `train`. Cast through `unknown` to satisfy
  // the `TrainableReasoner` shape without re-importing `TfjsReasoner`
  // here (its module is the dynamic import above and we don't want to
  // double-bundle).
  const trainable = reasoner as unknown as ConstructorParameters<
    typeof TfjsLearner<number[], number[]>
  >[0]['reasoner'];
  return new TfjsLearner<number[], number[]>({
    reasoner: trainable,
    toTrainingPair: (outcome) => {
      // Project FIRST so the recent-event window seen by this outcome's
      // training pair represents pre-this-outcome state. THEN record
      // the outcome into the window so the next call (and the next
      // tick's `featuresFromNeeds`) sees the bumped count.
      const pair = projectLearningOutcome(agent, outcome);
      const intentionType = outcome.intention.type;
      if (typeof intentionType === 'string') {
        const failed = (outcome.details as { failed?: unknown } | undefined)?.failed === true;
        recordOutcomeForFeatureWindow(failed ? 'failed' : 'completed');
      }
      return pair;
    },
    batchSize: LEARNER_BATCH_SIZE,
    onTrainError: (err) => {
      // eslint-disable-next-line no-console -- background-train diagnostics.
      console.warn('learning: background train failed', err);
    },
  });
}
