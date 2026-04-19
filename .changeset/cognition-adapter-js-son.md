---
'agentonomous': minor
---

Add a BDI cognition adapter at
`agentonomous/cognition/adapters/js-son`. Wraps the
[`js-son-agent`](https://github.com/TimKam/js-son) optional peer into a
`Reasoner` so consumers can drive intention selection from
beliefs / desires / plans instead of the default heuristic
`UrgencyReasoner`.

```ts
import { Belief, Desire, JsSonReasoner, Plan } from 'agentonomous/cognition/adapters/js-son';

agent.setReasoner(
  new JsSonReasoner({
    beliefs: { ...Belief('alive', true) },
    desires: {
      ...Desire('hungerCritical', (b) => (b.needs?.hunger ?? 1) < 0.3),
    },
    plans: [
      Plan(
        (intentions) => intentions.hungerCritical === true,
        () => [{ intention: { kind: 'satisfy', type: 'satisfy-need:hunger' } }],
      ),
    ],
  }),
);
```

Bodies return action arrays; any action carrying an `intention` field
is treated as the committed intention for that tick (last wins). The
default `toBeliefs` mapper exposes `needs` (flat `{id: level}`),
`candidates`, and a `topCandidate(filter?)` helper as beliefs so plans
can pick from the structured `ReasonerContext` without reaching past
the adapter. Consumers can override `toBeliefs` for custom mappings.

`reset()` rebuilds the underlying agent from the original options —
useful after major state shifts (e.g. lifecycle stage transitions).

Ships as a separate bundle entry — pulling `js-son-agent` into the
consumer's bundle is opt-in and only happens when this module is
imported.
