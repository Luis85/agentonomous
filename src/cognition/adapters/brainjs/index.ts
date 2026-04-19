// brain.js learning-bias adapter — import from
// `agentonomous/cognition/adapters/brainjs` so consumers only pull the
// `brain.js` peer dep into their bundle when they actually use this
// reasoner.
//
// brain.js ships its own TypeScript declarations under `dist/`, so
// (unlike the js-son adapter) no ambient shim is needed — the emitted
// `.d.ts` files resolve directly against the upstream package types.

export {
  BrainJsReasoner,
  type BrainJsHelpers,
  type BrainJsNetworkData,
  type BrainJsReasonerOptions,
} from './BrainJsReasoner.js';
