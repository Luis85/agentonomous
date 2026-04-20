import type { Reasoner, ReasonerContext } from 'agentonomous';
import type { CognitionModeSpec } from './index.js';
import networkJson from './learning.network.json';

/**
 * Stub learning mode. Loads a pre-built 1-layer brain.js network
 * (`learning.network.json`) with hand-chosen weights that produce
 * urgency-like scoring. The `interpret` function intentionally
 * ignores the network's output and passes through to `topCandidate`
 * — the network's contribution is demonstrating the "inference
 * pipeline routes through brain.js" path, not producing a
 * differentiated score. Real training + weight-driven interpretation
 * lives in 0.9.3.
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
    network.fromJSON(networkJson);

    return new BrainJsReasoner({
      network: network as never,
      featuresOf: (_ctx: ReasonerContext, helpers) => helpers.needsLevels() as never,
      interpret: (_output, _ctx, helpers) => {
        const top = helpers.topCandidate();
        return top ? top.intention : null;
      },
    });
  },
};
