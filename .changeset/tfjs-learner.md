---
'agentonomous': minor
---

Add `TfjsLearner` — the first real `Learner` implementation. Closes
Stage 8 (score) of the tick pipeline as a working reinforcement seam.

Ships as a sibling of `TfjsReasoner` under the same subpath:

```ts
import { TfjsReasoner, TfjsLearner } from 'agentonomous/cognition/adapters/tfjs';

const reasoner = await TfjsReasoner.fromJSON(snapshot, { featuresOf, interpret });
const learner = new TfjsLearner({
  reasoner,
  toTrainingPair: (outcome) => {
    if (outcome.reward === undefined) return null;
    return { features: projectFeatures(outcome), label: [outcome.reward] };
  },
  batchSize: 50,
  onBatchTrained: ({ finalLoss }) => console.log('batch loss', finalLoss),
});
const agent = createAgent({ id, species, reasoner, learner });
```

Behaviour:

- `score(outcome)` buffers one `LearningOutcome` and returns immediately
  (no tick-loop blocking).
- Once the buffer reaches `batchSize`, the learner kicks off a
  background `reasoner.train(pairs, { epochs, seed })` call.
- `flush()` trains on whatever the buffer holds right now, waiting on
  any in-flight background batch first.
- `bufferCapacity` caps the buffer; oldest entries drop FIFO once
  exceeded (prevents unbounded memory growth on a long-running agent).
- `onTrainError` surfaces background-train failures without tearing
  down the tick pipeline.
- `dispose()` stops accepting new outcomes.

Determinism contract: no RNG, no `Date.now()`, no `setTimeout` /
`setInterval`. `trainSeed` must be a stable consumer-supplied value
(defaults to `1`) — never `Math.random()` — or replays drift.

Addresses `docs/specs/2026-04-24-post-tfjs-improvements.md` §1.1.
`NoopLearner` stays as the zero-config default; `TfjsLearner` is opt-in.
