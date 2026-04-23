import type { Reasoner, ReasonerContext } from 'agentonomous';
import type { CognitionModeSpec } from './index.js';
import networkJson from './learning.network.json';

/**
 * Urgency floor for the learning-mode `interpret()` gate. The network's
 * scalar output is a [0, 1] urgency estimate — values below this floor
 * cause the pet to idle this tick rather than commit an intention.
 * Picked empirically so the default hand-authored weights produce a
 * visible idle rate and re-training shifts the observable behavior.
 */
const URGENCY_THRESHOLD = 0.35;

/**
 * Module-scoped agent id used as the localStorage key scope when
 * hydrating the trained network. Set once from `main.ts` after the
 * agent is created. Kept module-scoped (rather than widening
 * `CognitionModeSpec.construct(agentId)`) because no other mode needs
 * it — see plan 0.9.3 Task 4 for the rationale.
 */
let agentIdForHydration: string | null = null;

/** Inject the agent id used as the localStorage key scope when hydrating. */
export function setLearningAgentId(id: string | null): void {
  agentIdForHydration = id;
}

/**
 * Learning mode. On `construct()`, builds a brain.js network and
 * hydrates it from `agentonomous/<agentId>/brainjs-network` if the
 * Train button has been clicked previously this browser; otherwise
 * falls back to the bundled `learning.network.json` default with
 * hand-chosen weights.
 *
 * `interpret()` feeds the network's scalar output through an urgency
 * gate: the pet idles this tick when the output drops below
 * `URGENCY_THRESHOLD`; otherwise it commits the top heuristic
 * candidate. Trained and untrained networks thus produce different
 * idle rates, making training observable in the trace view.
 *
 * `construct()` is async so the adapter subpath (which pulls
 * `brain.js` as a side effect) only loads when this mode is
 * selected — keeping the peer out of the main chunk.
 */
export const learningMode: CognitionModeSpec = {
  id: 'learning',
  label: 'Learning (brain.js)',
  peerName: 'brain.js',
  async probe(): Promise<boolean> {
    try {
      await import('brain.js');
      return true;
    } catch {
      return false;
    }
  },
  async construct(): Promise<Reasoner> {
    // Pull the adapter + `brain.js` itself via dynamic imports. The
    // adapter's module-load side effect drags in brain.js's type
    // surface; we still need the runtime `NeuralNetwork` constructor
    // to hydrate the pre-built weights, so we import the peer here
    // too.
    const { BrainJsReasoner } = await import('agentonomous/cognition/adapters/brainjs');
    const brainModule = await import('brain.js');
    const NeuralNetwork =
      (brainModule as { NeuralNetwork?: unknown }).NeuralNetwork ??
      (brainModule as { default?: { NeuralNetwork?: unknown } }).default?.NeuralNetwork;
    if (typeof NeuralNetwork !== 'function') {
      throw new Error('learningMode: brain.js NeuralNetwork constructor not found');
    }

    const Net = NeuralNetwork as new () => {
      fromJSON: (json: unknown) => unknown;
      run: (input: unknown) => unknown;
    };
    const network = new Net();

    let seed: unknown = networkJson;
    if (agentIdForHydration !== null) {
      try {
        const persisted = globalThis.localStorage?.getItem(
          `agentonomous/${agentIdForHydration}/brainjs-network`,
        );
        if (typeof persisted === 'string' && persisted.length > 0) {
          seed = JSON.parse(persisted);
        }
      } catch {
        // Corrupt stored value or localStorage unavailable — fall back
        // to the default. The Train button regenerates valid state on
        // its next click.
      }
    }
    network.fromJSON(seed);

    return new BrainJsReasoner({
      network: network as never,
      featuresOf: (_ctx: ReasonerContext, helpers) => helpers.needsLevels() as never,
      interpret: (output, _ctx, helpers) => {
        const urgency = Array.isArray(output)
          ? ((output as unknown as number[])[0] ?? 0)
          : ((output as { score?: number }).score ?? 0);
        if (urgency < URGENCY_THRESHOLD) return null;
        const top = helpers.topCandidate();
        return top ? top.intention : null;
      },
    });
  },
};
