import type { Reasoner, ReasonerContext } from 'agentonomous';
import type { CognitionModeSpec } from './index.js';
import networkJson from './learning.network.json';

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
