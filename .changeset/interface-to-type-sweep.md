---
'agentonomous': patch
---

Convert all `src/` interfaces to `type` aliases. Closes a downstream-consumer footgun where TypeScript declaration merging could silently widen library contracts. Source-level consumers see no change; consumers relying on `declare module 'agentonomous'` augmentation of these symbols will need to wrap with their own type aliases instead.
