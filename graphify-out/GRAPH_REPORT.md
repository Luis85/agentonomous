# Graph Report - agent-library  (2026-04-25)

## Corpus Check
- 131 files · ~107,883 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 611 nodes · 1184 edges · 20 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 196 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 20|Community 20]]

## God Nodes (most connected - your core abstractions)
1. `Agent` - 25 edges
2. `createAgent()` - 16 edges
3. `TfjsReasoner` - 16 edges
4. `runRestore()` - 15 edges
5. `Modifiers` - 14 edges
6. `Needs` - 13 edges
7. `TfjsLearner` - 12 edges
8. `LocalStorageSnapshotStore` - 12 edges
9. `AnimationStateMachine` - 11 edges
10. `map()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `createAgent()` --calls--> `map()`  [INFERRED]
  src\agent\createAgent.ts → src\agent\result.ts
- `runRestore()` --calls--> `map()`  [INFERRED]
  src\agent\internal\RestoreCoordinator.ts → src\agent\result.ts
- `resolvePersistence()` --calls--> `pickDefaultSnapshotStore()`  [INFERRED]
  src\agent\createAgent.ts → src\persistence\pickDefaultSnapshotStore.ts
- `runRestore()` --calls--> `isInMemoryMemoryAdapter()`  [INFERRED]
  src\agent\internal\RestoreCoordinator.ts → src\memory\InMemoryMemoryAdapter.ts
- `runRestore()` --calls--> `runCatchUp()`  [INFERRED]
  src\agent\internal\RestoreCoordinator.ts → src\persistence\offlineCatchUp.ts

## Hyperedges (group relationships)
- **Four-cognition-mode switcher ensemble** — heuristic_mode, bt_mode_mistreevous, bdi_mode_jsson, learning_mode_brainjs, mount_cognition_switcher, cognition_mode_spec [EXTRACTED 1.00]
- **Reasoner port â€” 3 adapter implementations + reset call sites** — reasoner_port, mistreevous_reasoner, js_son_reasoner, tfjs_reasoner, reasoner_reset_method, agent_set_reasoner, agent_restore [EXTRACTED 1.00]
- **Stages skipped at setTimeScale(0) (Option A)** — modifiers_ticker, mood_reconciler, animation_reconciler, set_timescale, option_a_skip_stages [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (4): NoopBehavior, NoopReasoner, NumericModifierResolver, PassthroughValidator

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (75): Rationale: adapter owns full model lifecycle (Q2), Agent.restore (+ catch-up), Agent.setReasoner, AgentSnapshot, ApproachTreatSkill (examples-local), Rationale: async import() probe at mount time, TfjsReasoner.detectBestBackend + demo picker, Batch inference across agents (+67 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (13): Agent, AutoSaveTracker, ExcaliburAnimationBridge, isInMemoryMemoryAdapter(), matchesFilter(), NullLogger, MistreevousReasoner, runCatchUp() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (14): AgeModel, isInvokeSkillAction(), CognitionPipeline, ComposedNeedsPolicy, runDeath(), ExpressiveNeedsPolicy, InMemoryEventBus, LifecycleTicker (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (6): InMemoryMemoryAdapter, InMemorySnapshotStore, LocalStorageSnapshotStore, ManualClock, InMemoryRemoteController, SkillRegistry

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (40): Agent (class), AgentFacade, Agent.tick() pipeline, AgentTickedEvent, AnimationReconciler (Stage 2.8), AutoSaveTracker, Chapter A â€” Living agent, Chapter B â€” Why this action? (Decision Trace) (+32 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (10): ActiveNeedsPolicy, AnimationReconciler, AnimationStateMachine, applyModifierBias(), computeAvgUrgency(), DefaultMoodModel, pickBaseCategory(), clamp01() (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (9): map(), ok(), TfjsLearner, makeLcg(), seededShuffle(), TfjsBackendNotRegisteredError, TfjsReasoner, decodeWeights() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (12): defineSpecies(), AgentError, BudgetExceededError, DuplicateSkillError, InvalidSpeciesError, InvalidTimeScaleError, MissingDependencyError, SkillInvocationError (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (2): err(), mapErr()

### Community 10 - "Community 10"
Cohesion: 0.16
Nodes (7): resolvePersistence(), decodeKey(), encodeKey(), FsSnapshotStore, resolveBrowserStorage(), hasBrowserLocalStorage(), pickDefaultSnapshotStore()

### Community 11 - "Community 11"
Cohesion: 0.16
Nodes (16): createAgent, defineSpecies, DuplicateSkillError, encodeKey / decodeKey (percent-encoding), Rationale: silent overwrite masks bugs â†’ fail-fast, FsAdapter (injectable), FsSnapshotStore, Plan: FsSnapshotStore reversible keys (0.9.7 fix) (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.2
Nodes (4): isIntentionAction(), JsSonReasoner, hashSeed(), SeededRng

### Community 13 - "Community 13"
Cohesion: 0.2
Nodes (10): createAgent(), resolveLifecycle(), resolveMoodModel(), resolveNeeds(), resolveNeedsPolicy(), resolveRandomEvents(), resolveRng(), resolveSkills() (+2 more)

### Community 14 - "Community 14"
Cohesion: 0.21
Nodes (2): Modifiers, UrgencyReasoner

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (5): defaultAppearance(), defaultEmbodiment(), ExcaliburRemoteController, identityTransform(), translate()

### Community 16 - "Community 16"
Cohesion: 0.39
Nodes (1): ConsoleLogger

### Community 17 - "Community 17"
Cohesion: 0.5
Nodes (1): DirectBehaviorRunner

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (1): ExcaliburAgentActor

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (1): Agent

## Knowledge Gaps
- **43 isolated node(s):** `Agent`, `species.schema.json`, `Agent (class)`, `standardEvents.ts (event vocabulary)`, `Rationale: snapshot-copy trace.emitted at assembly` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 9`** (28 nodes): `result.ts`, `tuning.ts`, `defineModifier()`, `effectivenessFor()`, `createExpressionSkill()`, `defineModifier.ts`, `andThen()`, `err()`, `isErr()`, `isOk()`, `mapErr()`, `unwrap()`, `CleanSkill.ts`, `effectiveness.ts`, `ExpressionSkill.ts`, `ExpressMeowSkill.ts`, `ExpressSadSkill.ts`, `ExpressSleepySkill.ts`, `FeedSkill.ts`, `index.ts`, `MedicateSkill.ts`, `PetSkill.ts`, `PlaySkill.ts`, `RestSkill.ts`, `ScoldSkill.ts`, `Skill.ts`, `SkillContext.ts`, `SkillRegistry.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (14 nodes): `Modifiers`, `.decayMultiplier()`, `.has()`, `.intentionBonus()`, `.iterEffects()`, `.locomotionSpeedMultiplier()`, `.moodBias()`, `.removeAll()`, `.resolveNumeric()`, `.skillEffectiveness()`, `.tick()`, `UrgencyReasoner`, `.constructor()`, `.selectIntention()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (8 nodes): `ConsoleLogger`, `.constructor()`, `.debug()`, `.error()`, `.info()`, `.warn()`, `.write()`, `ConsoleLogger.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (4 nodes): `DirectBehaviorRunner`, `.constructor()`, `.mapIntention()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (3 nodes): `ExcaliburAgentActor`, `.constructor()`, `.sync()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `js-son-agent.d.ts`, `Agent`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Agent` connect `Community 2` to `Community 0`, `Community 3`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `map()` connect `Community 7` to `Community 9`, `Community 2`, `Community 3`, `Community 13`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `Modifiers` connect `Community 14` to `Community 0`, `Community 2`, `Community 7`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createAgent()` (e.g. with `.now()` and `map()`) actually correct?**
  _`createAgent()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `TfjsReasoner` (e.g. with `BrainJsReasoner (deprecated)` and `Pillar: Peer-optional brains`) actually correct?**
  _`TfjsReasoner` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `runRestore()` (e.g. with `.restore()` and `.setTimeScale()`) actually correct?**
  _`runRestore()` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Agent`, `species.schema.json`, `Agent (class)` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._