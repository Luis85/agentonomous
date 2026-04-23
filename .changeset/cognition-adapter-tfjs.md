---
'agentonomous': minor
---

Replace the `cognition/adapters/brainjs` subpath with a
TensorFlow.js-backed `cognition/adapters/tfjs`. `brain.js` was
effectively abandoned (10 open CVEs in its transitive build chain,
no upstream fix path), and the new adapter is a real upgrade — it
owns the full model lifecycle with `train()`, `toJSON()` /
`fromJSON()`, and deterministic inference under the default CPU
backend.

**Breaking:** the `cognition/adapters/brainjs` subpath export is
removed. Consumers who imported `BrainJsReasoner` migrate to
`TfjsReasoner`:

```ts
// Before
import { BrainJsReasoner } from 'agentonomous/cognition/adapters/brainjs';
import { NeuralNetwork } from 'brain.js';
const reasoner = new BrainJsReasoner({
  network: new NeuralNetwork().fromJSON(savedJson),
  featuresOf,
  interpret,
});

// After
import '@tensorflow/tfjs-backend-cpu';
import { TfjsReasoner } from 'agentonomous/cognition/adapters/tfjs';
const reasoner = await TfjsReasoner.fromJSON(savedSnapshot, { featuresOf, interpret });
```

The new adapter persists via a plain-JSON snapshot (topology +
base64 weights + shape manifest) rather than brain.js's `toJSON()`
format — stored weights don't migrate, but a fresh Train run
regenerates them in the demo.

See `docs/specs/2026-04-24-tfjs-cognition-adapter-design.md` for the
full design rationale, `docs/plans/2026-04-24-tfjs-cognition-adapter.md`
for the implementation trail.
