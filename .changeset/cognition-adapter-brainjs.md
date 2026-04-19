---
'agentonomous': minor
---

Add a learning-bias cognition adapter at
`agentonomous/cognition/adapters/brainjs`. Wraps a
[`brain.js`](https://github.com/BrainJS/brain.js) neural network into a
`Reasoner` so consumers can bias intention selection from a trained
model while still flowing through the same deterministic tick pipeline
as every other reasoner.

```ts
import { NeuralNetwork } from 'brain.js';
import { BrainJsReasoner } from 'agentonomous/cognition/adapters/brainjs';

const network = new NeuralNetwork<number[], number[]>().fromJSON(trainedWeights);

agent.setReasoner(
  new BrainJsReasoner({
    network,
    featuresOf: (_ctx, helpers) => {
      const needs = helpers.needsLevels();
      return [needs.hunger ?? 1, needs.energy ?? 1];
    },
    interpret: (out, _ctx, helpers) => {
      if ((out[0] ?? 0) < 0.5) return null;
      const top = helpers.topCandidate();
      return top ? top.intention : null;
    },
  }),
);
```

Each tick builds an input vector via `featuresOf`, runs a forward pass
through `network.run(...)`, and hands the output to `interpret`, which
returns the committed `Intention` (or `null` to idle). `helpers`
exposes `candidates`, `topCandidate(filter?)`, and `needsLevels()` —
the same shape as the mistreevous and js-son adapters.

**Inference only.** `NeuralNetwork.run()` is a pure forward pass with
fixed weights, so the whole pipeline stays byte-deterministic under a
seeded `Rng` + `ManualClock`. Training (`network.train()`) is
explicitly out of scope — it uses `Math.random` for weight
initialisation and SGD shuffling. Train offline, serialise with
`.toJSON()`, and rehydrate at construction time via `.fromJSON(...)`.

Ships as a separate bundle entry — pulling `brain.js` into the
consumer's bundle is opt-in and only happens when this module is
imported.
