# Graph Report - .  (2026-04-25)

## Corpus Check
- 165 files · ~124,428 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 935 nodes · 1673 edges · 39 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 278 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Agent Core & Tick|Agent Core & Tick]]
- [[_COMMUNITY_Agent Module Files|Agent Module Files]]
- [[_COMMUNITY_Needs & Age Pipeline|Needs & Age Pipeline]]
- [[_COMMUNITY_Persistence & FS|Persistence & FS]]
- [[_COMMUNITY_Design Decisions & Demo|Design Decisions & Demo]]
- [[_COMMUNITY_Events & Excalibur Bridge|Events & Excalibur Bridge]]
- [[_COMMUNITY_Homeostatic Models|Homeostatic Models]]
- [[_COMMUNITY_Roadmap Plans|Roadmap Plans]]
- [[_COMMUNITY_Public Agent API|Public Agent API]]
- [[_COMMUNITY_TFJS Cognition Adapter|TFJS Cognition Adapter]]
- [[_COMMUNITY_Agent Construction|Agent Construction]]
- [[_COMMUNITY_Modifier Definition|Modifier Definition]]
- [[_COMMUNITY_Recent Refactor Notes|Recent Refactor Notes]]
- [[_COMMUNITY_Errors & LLM Port|Errors & LLM Port]]
- [[_COMMUNITY_Body & Locomotion|Body & Locomotion]]
- [[_COMMUNITY_Default Skills Bundle|Default Skills Bundle]]
- [[_COMMUNITY_Review Bot Workflow|Review Bot Workflow]]
- [[_COMMUNITY_Tick Subsystems|Tick Subsystems]]
- [[_COMMUNITY_Snapshot Persistence|Snapshot Persistence]]
- [[_COMMUNITY_Branch & Release Process|Branch & Release Process]]
- [[_COMMUNITY_Urgency & Modifier Resolution|Urgency & Modifier Resolution]]
- [[_COMMUNITY_Species Definition|Species Definition]]
- [[_COMMUNITY_Console Logger|Console Logger]]
- [[_COMMUNITY_Scripted Controller|Scripted Controller]]
- [[_COMMUNITY_Behavior Runner|Behavior Runner]]
- [[_COMMUNITY_LLM Port Types|LLM Port Types]]
- [[_COMMUNITY_Random Events|Random Events]]
- [[_COMMUNITY_Logger Interface|Logger Interface]]
- [[_COMMUNITY_Validator Port|Validator Port]]
- [[_COMMUNITY_JS-Son Type Stub|JS-Son Type Stub]]
- [[_COMMUNITY_Excalibur Type Stubs|Excalibur Type Stubs]]
- [[_COMMUNITY_Interaction Event|Interaction Event]]
- [[_COMMUNITY_Agent Input Type|Agent Input Type]]
- [[_COMMUNITY_Agent Output Type|Agent Output Type]]
- [[_COMMUNITY_TFJS Reasoner Options|TFJS Reasoner Options]]
- [[_COMMUNITY_Standard Events|Standard Events]]
- [[_COMMUNITY_Input Source Type|Input Source Type]]
- [[_COMMUNITY_Catchup Options|Catchup Options]]
- [[_COMMUNITY_Default Active Skills|Default Active Skills]]

## God Nodes (most connected - your core abstractions)
1. `Agent` - 27 edges
2. `Agent (orchestrator)` - 19 edges
3. `TfjsReasoner` - 15 edges
4. `DomainEvent` - 15 edges
5. `buildAgentDeps()` - 14 edges
6. `Modifiers` - 14 edges
7. `Needs` - 13 edges
8. `Skill interface` - 13 edges
9. `agentonomous Product Vision` - 13 edges
10. `TfjsLearner` - 12 edges

## Surprising Connections (you probably didn't know these)
- `tfjs cognition adapter plan` --references--> `TfjsReasoner adapter class`  [INFERRED]
  docs/plans/2026-04-24-tfjs-cognition-adapter.md → src/cognition/adapters/tfjs/TfjsReasoner.ts
- `Post-tfjs improvements roadmap` --references--> `Learner interface (Stage-8 score)`  [EXTRACTED]
  docs/specs/2026-04-24-post-tfjs-improvements.md → src/cognition/learning/Learner.ts
- `agentonomous Product Vision` --references--> `LlmProviderPort`  [EXTRACTED]
  docs/specs/vision.md → src/ports/LlmProviderPort.ts
- `Track A â€” Remediation (4 persistence/restore findings)` --references--> `Agent.restore() (replace, not merge, modifier state)`  [EXTRACTED]
  docs/plans/2026-04-24-polish-and-harden.md → src/agent/Agent.ts
- `Track A â€” Remediation (4 persistence/restore findings)` --references--> `LocalStorageSnapshotStore`  [EXTRACTED]
  docs/plans/2026-04-24-polish-and-harden.md → src/persistence/LocalStorageSnapshotStore.ts

## Hyperedges (group relationships)
- **Agent.tick() pipeline stages** — agent_Agent, internal_LifecycleTicker, internal_ModifiersTicker, internal_MoodReconciler, internal_AnimationReconciler, internal_DeathCoordinator_runDeath, agent_DecisionTrace [EXTRACTED 1.00]
- **ControlMode dispatch (autonomous/scripted/remote)** — agent_ControlMode, agent_RemoteController, agent_ScriptedController, agent_Agent, agent_AgentAction [EXTRACTED 1.00]
- **Agent identity assembly (role + species + persona)** — createAgent_createAgent, agent_AgentIdentity, agent_AgentRole, agent_Species, agent_Persona [EXTRACTED 1.00]
- **Agent.tick pipeline stages (NeedsTicker -> CognitionPipeline -> tickHelpers)** —  [INFERRED 0.90]
- **Snapshot capture/restore symmetry** —  [INFERRED 0.90]
- **Embodiment composition (Transform + Appearance + LocomotionMode)** —  [EXTRACTED 1.00]
- **Reasoner port implementations** — reasoner_port, noop_reasoner, urgency_reasoner, mistreevous_reasoner, tfjs_reasoner [EXTRACTED 1.00]
- **Phase A no-op default ports for tick pipeline seams** — noop_reasoner, noop_behavior, noop_learner [INFERRED 0.85]
- **TfjsReasoner deterministic persistence + training pipeline** — tfjs_reasoner, tfjs_learner, tfjs_snapshot, tfjs_encode_weights, tfjs_decode_weights [EXTRACTED 1.00]
- **needs_policy_strategy_family** — active_needs_policy, expressive_needs_policy, composed_needs_policy, needs_policy [EXTRACTED 1.00]
- **modifier_system_core** — modifier, modifier_effect, modifier_target, modifiers, numeric_modifier_resolver [EXTRACTED 1.00]
- **lifecycle_aging_system** — age_model, life_stage, life_stage_schedule, stage_capability_map, lifecycle_descriptor [EXTRACTED 1.00]
- **** — in_memory_snapshot_store, fs_snapshot_store, local_storage_snapshot_store [EXTRACTED 1.00]
- **** — manual_clock, system_clock, wall_clock_port [EXTRACTED 1.00]
- **** — seeded_rng, manual_clock, snapshot_store_port [INFERRED 0.80]
- **default active skill bundle (FeedSkill, CleanSkill, PlaySkill, RestSkill, ScoldSkill, PetSkill, MedicateSkill all implement Skill and ship in defaultPetInteractionModule)** —  [INFERRED 0.90]
- **expression skill family (Meow/Sad/Sleepy share createExpressionSkill factory and emit ExpressionEmitted events)** —  [INFERRED 0.95]
- **need-satisfying skills (FeedSkill, PetSkill, PlaySkill, RestSkill all call satisfyNeed via SkillContext to alter homeostatic needs)** —  [INFERRED 0.85]
- **Cognition switcher + reasoner adapter rollout** —  [INFERRED 0.85]
- **Release + publishing workflow** —  [INFERRED 0.90]
- **Polish & harden remediation cluster** —  [INFERRED 0.90]
- **review-fix end-to-end pipeline (prompt â†’ skill â†’ workflow)** —  [EXTRACTED 1.00]
- **Pre-1.0 polish + harden multi-track program (remediation, CI, demo, lib seams)** —  [EXTRACTED 1.00]
- **tfjs learning-mode arc (adapter â†’ learner â†’ softmax â†’ richer features â†’ prediction strip)** —  [EXTRACTED 1.00]

## Communities

### Community 0 - "Agent Core & Tick"
Cohesion: 0.04
Nodes (24): Agent, assertRequiredDeps(), resolveCognition(), resolveCorePorts(), resolveSubsystems(), AutoSaveTracker, ExcaliburAnimationBridge, InMemoryEventBus (+16 more)

### Community 1 - "Agent Module Files"
Cohesion: 0.06
Nodes (3): ExcaliburAgentActor, NoopReasoner, PassthroughValidator

### Community 2 - "Needs & Age Pipeline"
Cohesion: 0.04
Nodes (21): ActiveNeedsPolicy, AgeModel, isInvokeSkillAction(), AnimationReconciler, AnimationStateMachine, CognitionPipeline, ComposedNeedsPolicy, runDeath() (+13 more)

### Community 3 - "Persistence & FS"
Cohesion: 0.05
Nodes (13): decodeKey(), encodeKey(), FsSnapshotStore, InMemoryMemoryAdapter, InMemorySnapshotStore, LifecycleTicker, LocalStorageSnapshotStore, resolveBrowserStorage() (+5 more)

### Community 4 - "Design Decisions & Demo"
Cohesion: 0.04
Nodes (60): Agent.restore() (replace, not merge, modifier state), CognitionPipeline.invokeSkillAction, examples/llm-mock deterministic playback example, examples/nurture-pet demo, FsSnapshotStore.list deterministic ordering, Learner interface (Stage-8 score), LlmProviderPort, LocalStorageSnapshotStore (+52 more)

### Community 5 - "Events & Excalibur Bridge"
Cohesion: 0.05
Nodes (51): AgentDiedEvent, AgentTickedEvent, BehaviorRunner, DirectBehaviorRunner, DirectBehaviorRunnerOptions, DomainEvent, EventBusPort, ExcaliburAgentActor (+43 more)

### Community 6 - "Homeostatic Models"
Cohesion: 0.06
Nodes (47): ActiveNeedsPolicy, AgeModel, AgeModelOptions, clamp01, ComposedNeedsPolicy, DecayMultiplierFn, DECEASED_STAGE, DefaultMoodModel (+39 more)

### Community 7 - "Roadmap Plans"
Cohesion: 0.07
Nodes (38): AGENT_TICKED constant + AgentTickedEvent, ApproachTreatSkill (examples-local), Train button + localStorage persistence for trained network, BT reactive interrupt on surpriseTreat, Async import() peer-dep capability probe, Demo snapshot Export / Import, Modifier expiry deferred to first post-resume tick, P0 â€” Need-decay calibration (+30 more)

### Community 8 - "Public Agent API"
Cohesion: 0.09
Nodes (37): Agent (orchestrator), AgentAction (union), AgentDependencies, AgentFacade, AgentIdentity, AgentModule, AgentRole, ArrayScriptedController (+29 more)

### Community 9 - "TFJS Cognition Adapter"
Cohesion: 0.09
Nodes (10): map(), ok(), TfjsLearner, makeLcg(), seededShuffle(), TfjsBackendNotRegisteredError, TfjsReasoner, decodeWeights() (+2 more)

### Community 10 - "Agent Construction"
Cohesion: 0.11
Nodes (25): buildAgeModel(), buildAgentDeps(), buildIdentity(), cognitionOptions(), installModuleSkills(), lifecycleOptions(), persistenceOptions(), portOptions() (+17 more)

### Community 11 - "Modifier Definition"
Cohesion: 0.15
Nodes (3): NumericModifierResolver, err(), mapErr()

### Community 12 - "Recent Refactor Notes"
Cohesion: 0.07
Nodes (32): Agent.ts extractions (RestoreCoordinator, DeathCoordinator, SnapshotAssembler), DuplicateSkillError type + replace() escape hatch, createExpressionSkill factory consolidates 3 express skills, facade.publishEvent bypassed trace + autosave hooks, _internalPublish / _internalDie rename (breaking), MockLlmProvider, pendingEvents was dead field â€” never populated/read, Percent-encoding for filename-safe reversible keys (+24 more)

### Community 13 - "Errors & LLM Port"
Cohesion: 0.08
Nodes (13): AgentError, BudgetExceededError, DuplicateSkillError, InvalidSpeciesError, InvalidTimeScaleError, MissingDependencyError, SkillInvocationError, SnapshotRestoreError (+5 more)

### Community 14 - "Body & Locomotion"
Cohesion: 0.1
Nodes (9): defaultAppearance(), defaultEmbodiment(), ExcaliburRemoteController, isIntentionAction(), JsSonReasoner, hashSeed(), SeededRng, identityTransform() (+1 more)

### Community 15 - "Default Skills Bundle"
Cohesion: 0.15
Nodes (27): CleanSkill, createExpressionSkill(), defaultExpressionSkills, defaultPetInteractionModule, effectivenessFor(), ExpressMeowSkill, ExpressSadSkill, ExpressSleepySkill (+19 more)

### Community 16 - "Review Bot Workflow"
Cohesion: 0.1
Nodes (27): CI workflow (ci.yml), Release workflow (release.yml), review-fix-shipped.yml workflow, review-fix SKILL.md, Changeset process gate (library behavior change requires .changeset/*.md), ci-gate aggregator + doc-only short-circuit via dorny/paths-filter, Counter-argument check (self-rebuttal of top BLOCKER), Dual sink: rolling issue comment + immutable daily doc (+19 more)

### Community 17 - "Tick Subsystems"
Cohesion: 0.14
Nodes (22): agentDepsResolver, AnimationState, AnimationStateMachine, AnimationTransitionEvent, Appearance, buildAgentDeps, CognitionPipeline, cognition/tuning (+14 more)

### Community 18 - "Snapshot Persistence"
Cohesion: 0.14
Nodes (22): AgentSnapshot, AgentState, AgentStateListener, AutoSavePolicy, AutoSaveTracker, bindAgentToStore, CURRENT_SNAPSHOT_VERSION, decodeKey (+14 more)

### Community 19 - "Branch & Release Process"
Cohesion: 0.11
Nodes (19): Branch model (main/develop/demo), Branch protection checklist, Changesets (semver bump + summary), Demo deployment (GitHub Pages), First release v1.0.0 setup, Husky + lint-staged pre-commit hooks, No --no-verify bypass, npm provenance attestation (+11 more)

### Community 20 - "Urgency & Modifier Resolution"
Cohesion: 0.23
Nodes (2): Modifiers, UrgencyReasoner

### Community 21 - "Species Definition"
Cohesion: 0.18
Nodes (13): createAgent overrides species defaults per-agent, passiveModifiers (species-level buffs/debuffs), SpeciesRegistry string-lookup convenience, defineSpecies, How to add a species, InvalidSpeciesError, defineSpecies validates duplicate need ids and lifecycle stages, Registry is deliberately local (no global singleton) (+5 more)

### Community 22 - "Console Logger"
Cohesion: 0.39
Nodes (1): ConsoleLogger

### Community 23 - "Scripted Controller"
Cohesion: 0.4
Nodes (1): ArrayScriptedController

### Community 24 - "Behavior Runner"
Cohesion: 0.5
Nodes (1): DirectBehaviorRunner

### Community 25 - "LLM Port Types"
Cohesion: 0.5
Nodes (4): LlmBudget, LlmCompletion, LlmMessage, LlmProviderPort

### Community 26 - "Random Events"
Cohesion: 0.67
Nodes (3): RandomEventContext, RandomEventDef, RandomEventTicker

### Community 27 - "Logger Interface"
Cohesion: 1.0
Nodes (3): ConsoleLogger, Logger, NullLogger

### Community 28 - "Validator Port"
Cohesion: 0.67
Nodes (3): PassthroughValidator, ValidationResult, Validator

### Community 29 - "JS-Son Type Stub"
Cohesion: 1.0
Nodes (1): Agent

### Community 30 - "Excalibur Type Stubs"
Cohesion: 1.0
Nodes (2): ActorLike, Vector2Like

### Community 31 - "Interaction Event"
Cohesion: 1.0
Nodes (2): INTERACTION_REQUESTED, InteractionRequestedEvent

### Community 38 - "Agent Input Type"
Cohesion: 1.0
Nodes (1): AgentInput

### Community 39 - "Agent Output Type"
Cohesion: 1.0
Nodes (1): AgentOutput

### Community 40 - "TFJS Reasoner Options"
Cohesion: 1.0
Nodes (1): TfjsReasonerOptions

### Community 41 - "Standard Events"
Cohesion: 1.0
Nodes (1): standardEvents

### Community 42 - "Input Source Type"
Cohesion: 1.0
Nodes (1): InputSourceLike

### Community 43 - "Catchup Options"
Cohesion: 1.0
Nodes (1): CatchUpOptions

### Community 44 - "Default Active Skills"
Cohesion: 1.0
Nodes (1): defaultActiveSkills

## Knowledge Gaps
- **178 isolated node(s):** `Agent`, `isInvokeSkillAction`, `isEmitEventAction`, `MissingDependencyError`, `SnapshotRestoreError` (+173 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Urgency & Modifier Resolution`** (13 nodes): `Modifiers`, `.decayMultiplier()`, `.has()`, `.intentionBonus()`, `.iterEffects()`, `.locomotionSpeedMultiplier()`, `.moodBias()`, `.resolveNumeric()`, `.skillEffectiveness()`, `.tick()`, `UrgencyReasoner`, `.constructor()`, `.selectIntention()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Console Logger`** (8 nodes): `ConsoleLogger`, `.constructor()`, `.debug()`, `.error()`, `.info()`, `.warn()`, `.write()`, `ConsoleLogger.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scripted Controller`** (5 nodes): `ArrayScriptedController`, `.constructor()`, `.isExhausted()`, `.next()`, `.reset()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Behavior Runner`** (4 nodes): `DirectBehaviorRunner`, `.constructor()`, `.mapIntention()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `JS-Son Type Stub`** (2 nodes): `js-son-agent.d.ts`, `Agent`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Excalibur Type Stubs`** (2 nodes): `ActorLike`, `Vector2Like`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Interaction Event`** (2 nodes): `INTERACTION_REQUESTED`, `InteractionRequestedEvent`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Agent Input Type`** (1 nodes): `AgentInput`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Agent Output Type`** (1 nodes): `AgentOutput`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `TFJS Reasoner Options`** (1 nodes): `TfjsReasonerOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Standard Events`** (1 nodes): `standardEvents`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Input Source Type`** (1 nodes): `InputSourceLike`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Catchup Options`** (1 nodes): `CatchUpOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Default Active Skills`** (1 nodes): `defaultActiveSkills`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Agent` connect `Agent Core & Tick` to `Agent Module Files`, `Needs & Age Pipeline`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `Polish + harden â€” pre-1.0 increments` connect `Design Decisions & Demo` to `Review Bot Workflow`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `TfjsReasoner` (e.g. with `TfjsLearner` and `MistreevousReasoner`) actually correct?**
  _`TfjsReasoner` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Agent`, `isInvokeSkillAction`, `isEmitEventAction` to the rest of the system?**
  _178 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Agent Core & Tick` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Agent Module Files` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Needs & Age Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._