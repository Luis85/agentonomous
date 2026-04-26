import { UrgencyReasoner } from 'agentonomous';
import type { CognitionModeSpec } from './index.js';

/**
 * Default cognition mode — the weighted-urgency scorer that the agent
 * uses without explicit `setReasoner`. Always available (no peer dep).
 */
export const heuristicMode: CognitionModeSpec = {
  id: 'heuristic',
  label: 'Heuristic (urgency)',
  peerName: null,
  probe: () => Promise.resolve(true),
  construct: () => Promise.resolve(new UrgencyReasoner()),
};
