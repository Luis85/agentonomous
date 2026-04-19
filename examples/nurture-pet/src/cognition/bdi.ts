import type { Reasoner } from 'agentonomous';
import type { CognitionModeSpec } from './index.js';

/**
 * Stub BDI mode. Routes selection through js-son's belief / desire /
 * plan pipeline but produces heuristic-equivalent behaviour — a
 * single plan always yields the current top candidate's intention.
 * Differentiated BDI authorship lives in a follow-up plan.
 *
 * `construct()` is async so the adapter subpath (which pulls
 * `js-son-agent` as a side effect) only loads when this mode is
 * selected — keeping the peer out of the main chunk.
 */
export const bdiMode: CognitionModeSpec = {
  id: 'bdi',
  label: 'BDI',
  peerName: 'js-son-agent',
  async probe(): Promise<boolean> {
    try {
      await import('js-son-agent');
      return true;
    } catch {
      return false;
    }
  },
  async construct(): Promise<Reasoner> {
    // The adapter subpath re-exports `JsSonReasoner` along with the
    // `Plan` factory from `js-son-agent` so consumers can author plans
    // without a direct peer import. A single dynamic import covers
    // both and lazy-loads the peer as a side effect.
    const { JsSonReasoner, Plan } = await import('agentonomous/cognition/adapters/js-son');

    return new JsSonReasoner({
      beliefs: { topCandidate: null },
      desires: {
        'pursue-top': (beliefs) => beliefs.topCandidate !== null,
      },
      plans: [
        Plan((beliefs) => beliefs.topCandidate !== null, function (this: {
          beliefs: { topCandidate: { intention: unknown } | null };
        }) {
          if (!this.beliefs.topCandidate) return [];
          return [{ intention: this.beliefs.topCandidate.intention }];
        } as never),
      ],
      toBeliefs: (_ctx, helpers) => ({ topCandidate: helpers.topCandidate() }),
    });
  },
};
