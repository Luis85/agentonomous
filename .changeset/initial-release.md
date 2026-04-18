---
'agentonomous': minor
---

Initial release. Phase A (M0–M15) ships a complete virtual-pet nurture library:

- Deterministic `Agent` class with tick pipeline + port-driven determinism
  (`WallClock`, `Rng`, `Logger`, `Validator`).
- Homeostatic needs, buff/debuff modifiers, lifecycle stages, categorical mood,
  animation state machine, default cognition (UrgencyReasoner +
  DirectBehaviorRunner), and 10 default skills
  (feed/clean/play/rest/pet/scold/medicate + expressive meow/sad/sleepy).
- Control modes: autonomous / scripted / remote.
- Species-agnostic via `SpeciesDescriptor` + `defineSpecies` factory + JSON
  schema (`schema/species.schema.json`).
- Persistence: `AgentSnapshot` versioned schema, `SnapshotStorePort` with
  `InMemory` / `LocalStorage` / `Fs` adapters, auto-save policy, offline
  catch-up.
- Reactive store binding (`bindAgentToStore`) — framework-agnostic.
- `agentonomous/integrations/excalibur` subpath entry with Actor sync, remote
  controller, animation bridge.
- Random events (`RandomEventTicker` + `defineRandomEvent`) with FX hints.
- 245 tests across 45 files; MVP `examples/nurture-pet` demo.
