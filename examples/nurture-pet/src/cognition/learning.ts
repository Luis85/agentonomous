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
 * Module-scoped agent id used as the localStorage key scope when
 * hydrating the trained network. Set once from `main.ts` after the
 * agent is created. Kept module-scoped (rather than widening
 * `CognitionModeSpec.construct(agentId)`) because no other mode needs
 * agent-id scoping.
 */
let agentIdForHydration: string | null = null;

/** Inject the agent id used as the localStorage key scope when hydrating. */
export function setLearningAgentId(id: string | null): void {
  agentIdForHydration = id;
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

function featuresFromNeeds(
  _ctx: ReasonerContext,
  helpers: { needsLevels(): Record<string, number> },
): number[] {
  const levels = helpers.needsLevels();
  return [
    levels.hunger ?? 0,
    levels.cleanliness ?? 0,
    levels.happiness ?? 0,
    levels.energy ?? 0,
    levels.health ?? 0,
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
    await import('@tensorflow/tfjs-backend-cpu');
    const tf = await import('@tensorflow/tfjs-core');
    const { TfjsReasoner } = await import('agentonomous/cognition/adapters/tfjs');
    type Snapshot = Parameters<typeof TfjsReasoner.fromJSON>[0];

    const persisted = loadPersistedSnapshot(agentIdForHydration);
    const seed: Snapshot = (persisted ?? networkJson) as Snapshot;

    const hydrate = async (snap: Snapshot): Promise<Reasoner> => {
      const r = await TfjsReasoner.fromJSON<number[], number[]>(snap, {
        featuresOf: featuresFromNeeds,
        interpret: (output) => interpretSoftmax(output),
      });
      // Reject snapshots whose output dimension doesn't match the
      // bundled topology. A pre-row-17 snapshot (single sigmoid output,
      // length 1) loads fine through `fromJSON` but its scalar urgency
      // bears no resemblance to a 7-way softmax — silently treating
      // `output[0]` as the `feed` probability would produce a "trained"
      // pet that always feeds whenever the old scalar exceeded the
      // idle floor. Throw so the caller falls back to the bundled
      // baseline.
      const outShape = r.getModel().outputs[0]?.shape;
      const lastDim = outShape && outShape.length > 0 ? outShape[outShape.length - 1] : null;
      if (lastDim !== SOFTMAX_DIM) {
        // Free the rebuilt-but-incompatible model's tensors before the
        // catch path constructs the bundled baseline. Without this,
        // re-entering Learning mode with an incompatible persisted
        // snapshot would leak one tfjs model + its weight tensors per
        // attempt.
        r.dispose();
        throw new Error(
          `learning: persisted snapshot has output dim ${String(lastDim)}, expected ${SOFTMAX_DIM} — rebuilding from bundled baseline.`,
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
 * into a 5-dim `(features, oneHotLabel)` training pair for the bundled
 * `learning.network.json` topology.
 *
 * - Features = current need levels (hunger, cleanliness, happiness,
 *   energy, health). Read at score-time, so the snapshot reflects the
 *   post-skill levels — that's the input the network would have to
 *   classify against on the *next* tick.
 * - Label = one-hot 7-vector for SUCCESSFUL outcomes only. Successes
 *   for skill `id` set `label[SOFTMAX_SKILL_IDS.indexOf(id)] = 1`.
 *
 * Returns `null` for:
 * - Outcomes whose intention is outside the 7-skill softmax index
 *   (e.g. an `express` intention from the heuristic-reactive layer).
 * - **Failed outcomes.** An all-zero target under
 *   `categoricalCrossentropy` (`-Σ y_i log p_i`) yields zero loss and
 *   zero gradient — the network would silently ignore failure samples,
 *   so the buffer slot is wasted. Skipping them keeps the loss honest;
 *   when row 18 lifts the failure signal into a richer feature set
 *   (negative `reward` field) we can revisit.
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

  const levels = agent.getState().needs;
  const features = [
    levels.hunger ?? 0,
    levels.cleanliness ?? 0,
    levels.happiness ?? 0,
    levels.energy ?? 0,
    levels.health ?? 0,
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
    toTrainingPair: (outcome) => projectLearningOutcome(agent, outcome),
    batchSize: LEARNER_BATCH_SIZE,
    onTrainError: (err) => {
      // eslint-disable-next-line no-console -- background-train diagnostics.
      console.warn('learning: background train failed', err);
    },
  });
}
