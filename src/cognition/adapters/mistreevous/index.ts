// Mistreevous behaviour-tree adapter — import from
// `agentonomous/cognition/adapters/mistreevous` so consumers only pull
// the `mistreevous` peer dep into their bundle when they actually use
// this reasoner.

export {
  MistreevousReasoner,
  type MistreevousHandler,
  type MistreevousHelpers,
  type MistreevousReasonerOptions,
} from './MistreevousReasoner.js';

// Re-export `State` so consumers can return `State.RUNNING` from
// handlers without adding `mistreevous` to their own imports.
export { State as MistreevousState } from 'mistreevous';
