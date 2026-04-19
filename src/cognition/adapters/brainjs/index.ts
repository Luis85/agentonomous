// brain.js learning-bias adapter — import from
// `agentonomous/cognition/adapters/brainjs` so consumers only pull the
// `brain.js` peer dep into their bundle when they actually use this
// reasoner.
//
// An ambient shim lives next to this file (`brain.d.ts`) and covers the
// narrow slice of `brain.js`'s type surface the adapter touches. Shipping
// the shim via a triple-slash `<reference>` directive injected at build
// time (see `vite.config.ts → copyAmbientDts`) keeps the library
// buildable without dragging brain.js's heavy native `gpu.js` peer into
// the dev install. When consumers install `brain.js` themselves its own
// types take precedence.

export {
  BrainJsReasoner,
  type BrainJsHelpers,
  type BrainJsNetworkData,
  type BrainJsReasonerOptions,
} from './BrainJsReasoner.js';
