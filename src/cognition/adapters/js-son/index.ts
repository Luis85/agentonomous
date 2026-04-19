// js-son BDI adapter — import from `agentonomous/cognition/adapters/js-son`
// so consumers only pull the `js-son-agent` peer dep into their bundle
// when they actually use this reasoner.
//
// `js-son-agent` ships no TypeScript types. The ambient module shim in
// `./js-son-agent.d.ts` types the slice we rely on; the build step
// copies it into `dist/` and prepends a triple-slash reference to the
// emitted `index.d.ts` and `JsSonReasoner.d.ts` so consumers pick it up
// automatically. See `vite.config.ts → prependAmbientDtsReferences`.

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
