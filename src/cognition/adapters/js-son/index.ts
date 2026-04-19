// js-son BDI adapter — import from `agentonomous/cognition/adapters/js-son`
// so consumers only pull the `js-son-agent` peer dep into their bundle
// when they actually use this reasoner.

export {
  JsSonReasoner,
  type JsSonBeliefHelpers,
  type JsSonBeliefMapper,
  type JsSonReasonerOptions,
} from './JsSonReasoner.js';

// Re-export the three BDI building blocks from the upstream library so
// consumers can author beliefs / desires / plans without adding a direct
// `js-son-agent` import of their own.
export { Belief, Desire, Plan } from 'js-son-agent';
