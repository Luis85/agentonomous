// TensorFlow.js neural-network adapter — import from
// `agentonomous/cognition/adapters/tfjs` so consumers only pull the
// `@tensorflow/tfjs-core` + `-layers` peer deps into their bundle when
// they actually use this reasoner. Ship-side backend packages
// (`-backend-cpu` / `-backend-wasm` / `-backend-webgl`) are separate
// optional peers; the consumer picks one and side-effect-imports it
// before constructing the reasoner.
//
// The adapter owns the full model lifecycle: inference (`selectIntention`),
// seeded training (`train()`), deterministic persistence (`toJSON()` /
// `fromJSON()`), and disposal (`dispose()`). Under the default CPU
// backend + a fixed seed it produces byte-identical inference — matching
// the library's determinism contract. GPU backends (WebGL / WebGPU) are
// supported for speed but weaken that contract; see the `TfjsReasoner`
// JSDoc for the full caveat.

export {
  TfjsReasoner,
  TfjsBackendNotRegisteredError,
  type TfjsReasonerOptions,
  type TfjsHelpers,
  type TrainOptions,
  type TrainResult,
} from './TfjsReasoner.js';
export { type TfjsSnapshot } from './TfjsSnapshot.js';
export { TfjsLearner, type TfjsLearnerOptions, type TrainableReasoner } from './TfjsLearner.js';
