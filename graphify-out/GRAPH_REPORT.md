# Graph Report - src+docs (2026-04-24)

## Corpus Check

- 147 files · ~98,058 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 600 nodes · 1145 edges · 18 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 169 edges (avg confidence: 0.8)
- Token cost: 78,000 input · 300 output

## Community Hubs (Navigation)

- [[_COMMUNITY_Cognition Plans & Vision|Cognition Plans & Vision]]
- [[_COMMUNITY_Tick & Animation Pipeline|Tick & Animation Pipeline]]
- [[_COMMUNITY_Snapshot & Persistence|Snapshot & Persistence]]
- [[_COMMUNITY_Agent Core & Event Bus|Agent Core & Event Bus]]
- [[_COMMUNITY_Agent Factory & Species|Agent Factory & Species]]
- [[_COMMUNITY_MVP Plans & Pause Semantics|MVP Plans & Pause Semantics]]
- [[_COMMUNITY_Agent Types & Excalibur|Agent Types & Excalibur]]
- [[_COMMUNITY_Skills & Core Types|Skills & Core Types]]
- [[_COMMUNITY_TfJS Reasoner & Learner|TfJS Reasoner & Learner]]
- [[_COMMUNITY_Reasoner & Intention Types|Reasoner & Intention Types]]
- [[_COMMUNITY_Needs & Mood|Needs & Mood]]
- [[_COMMUNITY_Errors & LLM Mock|Errors & LLM Mock]]
- [[_COMMUNITY_Species How-To & Registry|Species How-To & Registry]]
- [[_COMMUNITY_Urgency Reasoning & Modifiers|Urgency Reasoning & Modifiers]]
- [[_COMMUNITY_Logger|Logger]]
- [[_COMMUNITY_Lifecycle & Clock|Lifecycle & Clock]]
- [[_COMMUNITY_Seeded RNG|Seeded RNG]]
- [[_COMMUNITY_JS-Son Types|JS-Son Types]]

## God Nodes (most connected - your core abstractions)

1. `Agent` - 24 edges
2. `createAgent()` - 16 edges
3. `TfjsReasoner` - 16 edges
4. `Modifiers` - 14 edges
5. `Needs` - 13 edges
6. `TfjsLearner` - 12 edges
7. `AnimationStateMachine` - 11 edges
8. `LocalStorageSnapshotStore` - 10 edges
9. `agentonomous â€” Product Vision` - 10 edges
10. `map()` - 9 edges

## Surprising Connections (you probably didn't know these)

- `createAgent()` --calls--> `map()` [INFERRED]
  D:\Projects\agent-library\src\agent\createAgent.ts → D:\Projects\agent-library\src\agent\result.ts
- `resolvePersistence()` --calls--> `pickDefaultSnapshotStore()` [INFERRED]
  D:\Projects\agent-library\src\agent\createAgent.ts → D:\Projects\agent-library\src\persistence\pickDefaultSnapshotStore.ts
- `defaultEmbodiment()` --calls--> `defaultAppearance()` [INFERRED]
  D:\Projects\agent-library\src\body\Embodiment.ts → D:\Projects\agent-library\src\body\Appearance.ts
- `defaultEmbodiment()` --calls--> `identityTransform()` [INFERRED]
  D:\Projects\agent-library\src\body\Embodiment.ts → D:\Projects\agent-library\src\body\Transform.ts
- `encodeKey / decodeKey (percent-encoding)` --semantically_similar_to--> `TfjsSnapshot + encode/decodeWeights` [INFERRED] [semantically similar]
  docs/plans/2026-04-23-fs-snapshot-store-reversible-keys.md → docs/plans/2026-04-24-tfjs-cognition-adapter.md

## Hyperedges (group relationships)

- **Four-cognition-mode switcher ensemble** — heuristic_mode, bt_mode_mistreevous, bdi_mode_jsson, learning_mode_brainjs, mount_cognition_switcher, cognition_mode_spec [EXTRACTED 1.00]
- **Reasoner port â€” 3 adapter implementations + reset call sites** — reasoner_port, mistreevous_reasoner, js_son_reasoner, tfjs_reasoner, reasoner_reset_method, agent_set_reasoner, agent_restore [EXTRACTED 1.00]
- **Stages skipped at setTimeScale(0) (Option A)** — modifiers_ticker, mood_reconciler, animation_reconciler, set_timescale, option_a_skip_stages [EXTRACTED 1.00]

## Communities

### Community 0 - "Cognition Plans & Vision"

Cohesion: 0.04
Nodes (72): Rationale: adapter owns full model lifecycle (Q2), Agent.restore (+ catch-up), Agent.setReasoner, ApproachTreatSkill (examples-local), Rationale: async import() probe at mount time, TfjsReasoner.detectBestBackend + demo picker, Batch inference across agents, BDI mode (js-son) stub (+64 more)

### Community 1 - "Tick & Animation Pipeline"

Cohesion: 0.04
Nodes (12): ActiveNeedsPolicy, AgeModel, AnimationReconciler, AnimationStateMachine, ComposedNeedsPolicy, ExcaliburAnimationBridge, ExpressiveNeedsPolicy, InMemoryEventBus (+4 more)

### Community 2 - "Snapshot & Persistence"

Cohesion: 0.06
Nodes (11): decodeKey(), encodeKey(), FsSnapshotStore, InMemoryMemoryAdapter, matchesFilter(), InMemorySnapshotStore, LocalStorageSnapshotStore, resolveBrowserStorage() (+3 more)

### Community 3 - "Agent Core & Event Bus"

Cohesion: 0.07
Nodes (7): Agent, isInMemoryMemoryAdapter(), isInvokeSkillAction(), AutoSaveTracker, CognitionPipeline, runCatchUp(), SystemClock

### Community 4 - "Agent Factory & Species"

Cohesion: 0.08
Nodes (17): defaultAppearance(), createAgent(), resolveLifecycle(), resolveMoodModel(), resolveNeeds(), resolveNeedsPolicy(), resolvePersistence(), resolveRandomEvents() (+9 more)

### Community 5 - "MVP Plans & Pause Semantics"

Cohesion: 0.06
Nodes (43): Agent (class), AgentFacade, AgentSnapshot, Agent.tick() pipeline, AgentTickedEvent, AnimationReconciler (Stage 2.8), AutoSaveTracker, Chapter A â€” Living agent (+35 more)

### Community 6 - "Agent Types & Excalibur"

Cohesion: 0.07
Nodes (7): DirectBehaviorRunner, ExcaliburAgentActor, ExcaliburRemoteController, NoopBehavior, InMemoryRemoteController, ArrayScriptedController, PassthroughValidator

### Community 7 - "Skills & Core Types"

Cohesion: 0.14
Nodes (2): err(), mapErr()

### Community 8 - "TfJS Reasoner & Learner"

Cohesion: 0.08
Nodes (10): NoopLearner, map(), ok(), TfjsLearner, makeLcg(), seededShuffle(), TfjsBackendNotRegisteredError, TfjsReasoner (+2 more)

### Community 9 - "Reasoner & Intention Types"

Cohesion: 0.12
Nodes (4): isIntentionAction(), JsSonReasoner, NoopReasoner, NumericModifierResolver

### Community 10 - "Needs & Mood"

Cohesion: 0.11
Nodes (9): applyModifierBias(), computeAvgUrgency(), DefaultMoodModel, pickBaseCategory(), MoodReconciler, clamp01(), DEFAULT_URGENCY_CURVE(), Needs (+1 more)

### Community 11 - "Errors & LLM Mock"

Cohesion: 0.08
Nodes (11): AgentError, BudgetExceededError, DuplicateSkillError, InvalidSpeciesError, InvalidTimeScaleError, MissingDependencyError, SkillInvocationError, SnapshotRestoreError (+3 more)

### Community 12 - "Species How-To & Registry"

Cohesion: 0.16
Nodes (16): createAgent, defineSpecies, DuplicateSkillError, encodeKey / decodeKey (percent-encoding), Rationale: silent overwrite masks bugs â†’ fail-fast, FsAdapter (injectable), FsSnapshotStore, Plan: FsSnapshotStore reversible keys (0.9.7 fix) (+8 more)

### Community 13 - "Urgency Reasoning & Modifiers"

Cohesion: 0.21
Nodes (2): Modifiers, UrgencyReasoner

### Community 14 - "Logger"

Cohesion: 0.21
Nodes (2): ConsoleLogger, NullLogger

### Community 15 - "Lifecycle & Clock"

Cohesion: 0.22
Nodes (2): LifecycleTicker, ManualClock

### Community 16 - "Seeded RNG"

Cohesion: 0.43
Nodes (2): hashSeed(), SeededRng

### Community 17 - "JS-Son Types"

Cohesion: 1.0
Nodes (1): Agent

## Knowledge Gaps

- **43 isolated node(s):** `Agent`, `species.schema.json`, `Agent (class)`, `standardEvents.ts (event vocabulary)`, `Rationale: snapshot-copy trace.emitted at assembly` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Skills & Core Types`** (38 nodes): `AgentFacade.ts`, `AgentModule.ts`, `CognitionPipeline.ts`, `result.ts`, `types.ts`, `tuning.ts`, `defineModifier()`, `effectivenessFor()`, `DomainEvent.ts`, `standardEvents.ts`, `getFxHint()`, `withFxHint()`, `InteractionRequestedEvent.ts`, `defineModifier.ts`, `Modifier.ts`, `WallClock.ts`, `fxHint.ts`, `andThen()`, `err()`, `isErr()`, `isOk()`, `mapErr()`, `unwrap()`, `CleanSkill.ts`, `effectiveness.ts`, `ExpressMeowSkill.ts`, `ExpressSadSkill.ts`, `ExpressSleepySkill.ts`, `FeedSkill.ts`, `index.ts`, `MedicateSkill.ts`, `PetSkill.ts`, `PlaySkill.ts`, `RestSkill.ts`, `ScoldSkill.ts`, `Skill.ts`, `SkillContext.ts`, `SkillRegistry.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Urgency Reasoning & Modifiers`** (14 nodes): `Modifiers`, `.decayMultiplier()`, `.has()`, `.intentionBonus()`, `.iterEffects()`, `.locomotionSpeedMultiplier()`, `.moodBias()`, `.removeAll()`, `.resolveNumeric()`, `.skillEffectiveness()`, `.tick()`, `UrgencyReasoner`, `.constructor()`, `.selectIntention()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Logger`** (13 nodes): `ConsoleLogger`, `.constructor()`, `.debug()`, `.error()`, `.info()`, `.warn()`, `.write()`, `NullLogger`, `.debug()`, `.error()`, `.info()`, `ConsoleLogger.ts`, `Logger.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Lifecycle & Clock`** (9 nodes): `LifecycleTicker.ts`, `LifecycleTicker`, `.constructor()`, `.run()`, `ManualClock`, `.advance()`, `.constructor()`, `.now()`, `ManualClock.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Seeded RNG`** (8 nodes): `SeededRng.ts`, `hashSeed()`, `SeededRng`, `.chance()`, `.constructor()`, `.int()`, `.next()`, `.pick()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `JS-Son Types`** (2 nodes): `js-son-agent.d.ts`, `Agent`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `Agent` connect `Agent Core & Event Bus` to `Tick & Animation Pipeline`, `Agent Types & Excalibur`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `Modifiers` connect `Urgency Reasoning & Modifiers` to `TfJS Reasoner & Learner`, `Reasoner & Intention Types`, `Agent Core & Event Bus`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `map()` connect `TfJS Reasoner & Learner` to `Tick & Animation Pipeline`, `Agent Core & Event Bus`, `Agent Factory & Species`, `Skills & Core Types`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createAgent()` (e.g. with `.now()` and `map()`) actually correct?**
  _`createAgent()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `TfjsReasoner` (e.g. with `BrainJsReasoner (deprecated)` and `Pillar: Peer-optional brains`) actually correct?**
  _`TfjsReasoner` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Agent`, `species.schema.json`, `Agent (class)` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cognition Plans & Vision` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
