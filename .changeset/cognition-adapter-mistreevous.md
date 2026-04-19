---
'agentonomous': minor
---

Add a behaviour-tree cognition adapter at
`agentonomous/cognition/adapters/mistreevous`. Wraps the
[`mistreevous`](https://www.npmjs.com/package/mistreevous) optional
peer into a `Reasoner` so consumers can drive intention selection from
an MDSL behaviour tree instead of the default heuristic
`UrgencyReasoner`.

```ts
import { MistreevousReasoner } from 'agentonomous/cognition/adapters/mistreevous';

agent.setReasoner(
  new MistreevousReasoner({
    definition: `root { selector { ... } }`,
    handlers: {
      hungerCritical: (ctx) => /* read needs, return boolean */ ,
      pickHunger: (_ctx, helpers) => {
        const top = helpers.topCandidate(c => c.intention.type === 'satisfy-need:hunger');
        if (top) helpers.commit(top.intention);
      },
    },
    // Optional: forward the agent's seeded RNG so `lotto` / `wait` /
    // `repeat` / `retry` nodes stay deterministic.
    random: () => agentRng.next(),
  }),
);
```

Ships as a separate bundle entry — pulling `mistreevous` into the
consumer's bundle is opt-in and only happens when this module is
imported.
