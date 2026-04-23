import type { Reasoner } from 'agentonomous';
import type { CognitionModeSpec } from './index.js';

/**
 * Sentinel for "no candidate this tick." js-son's belief classifier
 * calls `beliefs[key].rule` on every belief value without a null check,
 * so a literal `null` triggers `TypeError: Cannot read properties of
 * null (reading 'rule')` inside `agent.next()`. Wrapping the state in a
 * non-null object and signalling absence via `intention: null` keeps
 * the belief value classifier-safe while still letting plans gate on
 * whether an intention is present.
 */
type TopCandidateBelief = { intention: unknown };
const NO_CANDIDATE: TopCandidateBelief = { intention: null };

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
      beliefs: { topCandidate: NO_CANDIDATE },
      desires: {
        // Desires are called with beliefs. The desire is "active" (returns
        // true) whenever there's a real candidate — that activates the
        // `pursue-top` intention.
        'pursue-top': (beliefs) => (beliefs.topCandidate as TopCandidateBelief).intention !== null,
      },
      plans: [
        // Plans are called with the *intentions* object (not beliefs), so
        // the rule gates on whether `pursue-top` fired; the body pulls the
        // actual intention off `this.beliefs.topCandidate` (Agent context).
        Plan(
          (intentions: { 'pursue-top'?: boolean }) => intentions['pursue-top'] === true,
          function (this: { beliefs: { topCandidate: TopCandidateBelief } }) {
            const intention = this.beliefs.topCandidate.intention;
            if (intention === null) return [];
            return [{ intention }];
          } as never,
        ),
      ],
      toBeliefs: (_ctx, helpers) => {
        const top = helpers.topCandidate();
        return {
          topCandidate: top ? { intention: top.intention } : NO_CANDIDATE,
        };
      },
    });
  },
};
