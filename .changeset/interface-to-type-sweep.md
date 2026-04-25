---
'agentonomous': major
---

Convert all `src/` interfaces to `type` aliases. Closes a downstream-consumer footgun where TypeScript declaration merging could silently widen library contracts.

**Breaking change for declaration-merging consumers.** Source-level consumers that import these symbols see no behavioural change — `class … implements <port>` still typechecks because TypeScript accepts `type` aliases on the right of `implements`. Consumers relying on `declare module 'agentonomous'` augmentation of the converted symbols will find their merges silently dropped — `type` aliases are not mergeable. Bumped to **major** because patch ranges (`~`/`^`) would auto-adopt this on otherwise safe upgrades and break downstream TypeScript builds.
