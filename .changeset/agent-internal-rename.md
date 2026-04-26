---
'agentonomous': major
---

Rename the two `@internal` hooks on `Agent` that helper classes under
`src/agent/internal/` use to drive the tick pipeline:

- `Agent._internalPublish(event)` → `Agent.publishEvent(event)`
- `Agent._internalDie(cause, reason, at)` → `Agent.routeDeath(cause, reason, at)`

Both methods remain `@internal` (not re-exported from the public
barrel). The rename drops the leading-underscore convention in favour
of the TSDoc `@internal` tag + barrel discipline, matches the
direction of 1.0.3 "narrow the public surface", and aligns with
`STYLE_GUIDE.md`'s updated naming rules.

**Breaking** only for consumers who reached past the barrel and called
the underscore-prefixed methods directly. No public / re-exported
symbol changed. Migration is a one-line sweep:

```ts
// Before
agent._internalPublish(event);
agent._internalDie('explicit', 'from:unit-test', now);

// After
agent.publishEvent(event);
agent.routeDeath('explicit', 'from:unit-test', now);
```
