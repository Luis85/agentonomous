---
'agentonomous': major
---

Narrow the public barrel for the 1.0 freeze. Two changes:

**Removed from `src/index.ts`:**

- `AgentDependencies` type. The direct `new Agent(deps)` constructor is
  still exported (needed as the `createAgent` return type), but the
  dependency bag is now internal — consumers go through
  `createAgent(config)`. Tests inside this repo still reach the
  interface via a relative `./agent/Agent.js` import.

**Marked `@experimental` (stays public, reshape risk flagged):**

- `AgentModule` interface — reshapes in 1.1 (composable kernel:
  `requires` / `provides` / `hooks` ordering, `serialize` / `restore`).
- `ReactiveHandler` interface — same reshape window.
- `Needs`, `Modifiers`, `AgeModel` class direct constructors — wrapped
  by per-subsystem modules in 1.1. Consumers should prefer
  `createAgent({ species: { ... } })` descriptors.

Per the v1 plan §1.0.3, reshaping an `@experimental` symbol is a
**minor** bump, not major. Adding `@experimental` to an existing
symbol is likewise a minor bump — no runtime behaviour changed.

Also adds `tests/unit/exports.test.ts`, a CI guard that asserts the
five-subpath export contract in `package.json` matches the 1.0 freeze
(core / excalibur / mistreevous / js-son / tfjs) so future renames
break CI instead of silently shipping.

**Migration:**

```ts
// Before
import { Agent, type AgentDependencies } from 'agentonomous';
const deps: AgentDependencies = { /* … */ };
const agent = new Agent(deps);

// After
import { createAgent } from 'agentonomous';
const agent = createAgent({ id: 'pet', species: /* … */ });
// Or, if you genuinely need the bag-of-dependencies shape, import
// from the package's source layout (see STYLE_GUIDE and the v1
// plan — this is intentionally no longer a public surface).
```
