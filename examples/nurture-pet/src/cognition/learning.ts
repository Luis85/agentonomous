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
 * Urgency floor for the learning-mode `interpret()` gate. The network's
 * scalar output is a [0, 1] urgency estimate — values below this floor
 * cause the pet to idle this tick rather than commit an intention.
 *
 * Picked empirically so the default hand-authored weights produce a
 * visible idle rate and re-training shifts the observable behavior.
 * Tune up (toward 0.5) if the post-train idle rate is indistinguishable
 * from the baseline; tune down (toward 0.2) if the pet rarely acts.
 */
const URGENCY_THRESHOLD = 0.35;

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

function interpretUrgency(
  output: number[],
  _ctx: ReasonerContext,
  helpers: {
    topCandidate(): { intention: import('agentonomous').Intention } | null;
  },
): import('agentonomous').Intention | null {
  const urgency = output[0] ?? 0;
  if (urgency < URGENCY_THRESHOLD) return null;
  const top = helpers.topCandidate();
  return top ? top.intention : null;
}

/**
 * Learning mode. On `construct()`, hydrates the TfjsReasoner from the
 * browser-local persisted snapshot if present, falling back to the
 * bundled `learning.network.json` baseline. The Train button in the
 * switcher calls `reasoner.train(...)` and persists `reasoner.toJSON()`.
 *
 * `interpret()` feeds the network's scalar output through an urgency
 * gate: the pet idles this tick when the output drops below
 * `URGENCY_THRESHOLD`; otherwise it commits the top heuristic
 * candidate. Trained and untrained networks thus produce different
 * idle rates, making training observable in the trace view.
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
        interpret: interpretUrgency,
      });
      // The rebuilt Sequential ships uncompiled; compile with a default
      // SGD + MSE pair so the Train button can call `r.train(...)`.
      r.getModel().compile({ optimizer: tf.train.sgd(0.1), loss: 'meanSquaredError' });
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
 * into a 5-dim `(features, label)` training pair for the bundled
 * `learning.network.json` topology.
 *
 * - Features = current need levels (hunger, cleanliness, happiness,
 *   energy, health). Read at score-time, so the snapshot reflects the
 *   post-skill levels — that's the input the network would have to
 *   classify "should I act?" against on the *next* tick.
 * - Label = `[1]` when the outcome marks the skill as completed
 *   successfully; `[0]` when it failed (`details.failed === true`,
 *   shipped from `CognitionPipeline.scoreFailure`).
 *
 * Returns `null` for outcomes with no usable signal — e.g. a future
 * shape that doesn't carry `details.failed` and has no positive
 * effectiveness either.
 */
function projectLearningOutcome(
  agent: Agent,
  outcome: LearningOutcome,
): { features: number[]; label: number[] } | null {
  const levels = agent.getState().needs;
  const features = [
    levels.hunger ?? 0,
    levels.cleanliness ?? 0,
    levels.happiness ?? 0,
    levels.energy ?? 0,
    levels.health ?? 0,
  ];
  const details = outcome.details ?? {};
  const failed = (details as { failed?: unknown }).failed === true;
  if (failed) {
    return { features, label: [0] };
  }
  // Success path: SkillCompleted with a positive effectiveness.
  const eff = (details as { effectiveness?: unknown }).effectiveness;
  if (typeof eff === 'number' && Number.isFinite(eff) && eff > 0) {
    return { features, label: [1] };
  }
  return null;
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
