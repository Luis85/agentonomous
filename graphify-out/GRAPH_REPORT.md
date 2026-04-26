# Graph Report - chore-graphify-refresh  (2026-04-27)

## Corpus Check
- 134 files · ~183,390 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 692 nodes · 1320 edges · 29 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 207 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]

## God Nodes (most connected - your core abstractions)
1. `Agent` - 27 edges
2. `buildAgentDeps()` - 14 edges
3. `Modifiers` - 14 edges
4. `Needs` - 13 edges
5. `TfjsLearner` - 12 edges
6. `LocalStorageSnapshotStore` - 12 edges
7. `map()` - 11 edges
8. `AnimationStateMachine` - 11 edges
9. `Polish + harden â€” pre-1.0 increments` - 11 edges
10. `agentonomous Product Vision` - 11 edges

## Surprising Connections (you probably didn't know these)
- `map()` --calls--> `restoreModifiers()`  [INFERRED]
  src\agent\result.ts → src\agent\internal\RestoreCoordinator.ts
- `map()` --calls--> `installModuleSkills()`  [INFERRED]
  src\agent\result.ts → src\agent\internal\buildAgentDeps.ts
- `runCatchUpIfRequested()` --calls--> `runCatchUp()`  [INFERRED]
  src\agent\internal\RestoreCoordinator.ts → src\persistence\offlineCatchUp.ts
- `assembleSnapshot()` --calls--> `isInMemoryMemoryAdapter()`  [INFERRED]
  src\agent\internal\SnapshotAssembler.ts → src\memory\InMemoryMemoryAdapter.ts
- `resolvePersistence()` --calls--> `pickDefaultSnapshotStore()`  [INFERRED]
  src\agent\internal\buildAgentDeps.ts → src\persistence\pickDefaultSnapshotStore.ts

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

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (29): ActiveNeedsPolicy, Agent, isInvokeSkillAction(), assertRequiredDeps(), resolveCognition(), resolveCorePorts(), resolveSubsystems(), AutoSaveTracker (+21 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (3): ExcaliburAgentActor, NumericModifierResolver, PassthroughValidator

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (37): defaultAppearance(), buildAgeModel(), buildAgentDeps(), buildIdentity(), cognitionOptions(), installModuleSkills(), lifecycleOptions(), persistenceOptions() (+29 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (10): InMemoryMemoryAdapter, matchesFilter(), InMemorySnapshotStore, LifecycleTicker, LocalStorageSnapshotStore, resolveBrowserStorage(), ManualClock, hasBrowserLocalStorage() (+2 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (50): A1 architectural guardrails (PR #75), A2 remediation track (PRs #71-#74), Agent class deterministic tick pipeline, TfjsReasoner.detectBestBackend + demo backend picker, brain.js â†’ tfjs swap (rationale: abandoned upstream + install-hostile), Cognition switcher with capability states, Track 3 â€” complexity ratchet (refactor cyclomatic), Decision Trace panel (needs + candidates + selected skill) (+42 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (12): NoopReasoner, map(), ok(), loadBackendModule(), makeLcg(), probeBackendInternal(), seededShuffle(), TfjsBackendNotRegisteredError (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (15): applyModifierBias(), computeAvgUrgency(), DefaultMoodModel, pickBaseCategory(), isInMemoryMemoryAdapter(), MistreevousReasoner, MoodReconciler, clamp01() (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (38): AGENT_TICKED constant + AgentTickedEvent, ApproachTreatSkill (examples-local), Train button + localStorage persistence for trained network, BT reactive interrupt on surpriseTreat, Async import() peer-dep capability probe, Demo snapshot Export / Import, Modifier expiry deferred to first post-resume tick, P0 â€” Need-decay calibration (+30 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (32): Agent.ts extractions (RestoreCoordinator, DeathCoordinator, SnapshotAssembler), DuplicateSkillError type + replace() escape hatch, createExpressionSkill factory consolidates 3 express skills, facade.publishEvent bypassed trace + autosave hooks, _internalPublish / _internalDie rename (breaking), MockLlmProvider, pendingEvents was dead field â€” never populated/read, Percent-encoding for filename-safe reversible keys (+24 more)

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (2): err(), mapErr()

### Community 10 - "Community 10"
Cohesion: 0.1
Nodes (4): AgeModel, AnimationReconciler, AnimationStateMachine, runDeath()

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (19): Branch model (main/develop/demo), Branch protection checklist, Changesets (semver bump + summary), Demo deployment (GitHub Pages), First release v1.0.0 setup, Husky + lint-staged pre-commit hooks, No --no-verify bypass, npm provenance attestation (+11 more)

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (4): decodeKey(), encodeKey(), FsSnapshotStore, SkillRegistry

### Community 13 - "Community 13"
Cohesion: 0.16
Nodes (17): Changeset process gate (library behavior change requires .changeset/*.md), ci-gate aggregator + doc-only short-circuit via dorny/paths-filter, Counter-argument check (self-rebuttal of top BLOCKER), Dual sink: rolling issue comment + immutable daily doc, Finding ID format <head-sha[:7]>.<idx>, Magic PR body line: Refs #87 finding:<id>, Repo invariants â€” hard rules (BLOCKER on violation), review-fix-shipped GitHub Action (+9 more)

### Community 14 - "Community 14"
Cohesion: 0.2
Nodes (4): isIntentionAction(), JsSonReasoner, hashSeed(), SeededRng

### Community 15 - "Community 15"
Cohesion: 0.23
Nodes (9): abortStub(), buildUsage(), enforceBudget(), estimateTokens(), estimateTokensFor(), MockLlmProvider, pickFromMatchOrError(), pickFromQueue() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.27
Nodes (1): TfjsLearner

### Community 17 - "Community 17"
Cohesion: 0.39
Nodes (1): ConsoleLogger

### Community 18 - "Community 18"
Cohesion: 0.4
Nodes (1): ArrayScriptedController

### Community 19 - "Community 19"
Cohesion: 0.5
Nodes (1): DirectBehaviorRunner

### Community 20 - "Community 20"
Cohesion: 0.5
Nodes (4): createAgent overrides species defaults per-agent, passiveModifiers (species-level buffs/debuffs), SpeciesRegistry string-lookup convenience, How to add a species

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (1): Agent

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (1): Registry is deliberately local (no global singleton)

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (1): defineSpecies validates duplicate need ids and lifecycle stages

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (1): Rationale: pull_request_target trigger gives write-capable token from forks safely

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (1): Rationale: global concurrency group prevents shipped-state race overwrites

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (1): Rationale: only flip when PR base is develop (avoids hotfix/main false-shipped)

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (1): Rationale: surface non-404 read errors and write failures via hardFailures counter

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (1): Rationale: never use git worktree add -B (force) â€” would silently rewind work

## Knowledge Gaps
- **100 isolated node(s):** `Agent`, `Registry is deliberately local (no global singleton)`, `defineSpecies validates duplicate need ids and lifecycle stages`, `release-candidate.yml workflow`, `npm provenance attestation` (+95 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 9`** (28 nodes): `result.ts`, `tuning.ts`, `defineModifier()`, `effectivenessFor()`, `createExpressionSkill()`, `defineModifier.ts`, `andThen()`, `err()`, `isErr()`, `isOk()`, `mapErr()`, `unwrap()`, `CleanSkill.ts`, `effectiveness.ts`, `ExpressionSkill.ts`, `ExpressMeowSkill.ts`, `ExpressSadSkill.ts`, `ExpressSleepySkill.ts`, `FeedSkill.ts`, `index.ts`, `MedicateSkill.ts`, `PetSkill.ts`, `PlaySkill.ts`, `RestSkill.ts`, `ScoldSkill.ts`, `Skill.ts`, `SkillContext.ts`, `SkillRegistry.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (13 nodes): `TfjsLearner.ts`, `TfjsLearner`, `.batchSize()`, `.bufferedCount()`, `.capacity()`, `.constructor()`, `.dispose()`, `.flush()`, `.isTraining()`, `.maybeScheduleTrain()`, `.runTrain()`, `.score()`, `.trainBackground()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (8 nodes): `ConsoleLogger`, `.constructor()`, `.debug()`, `.error()`, `.info()`, `.warn()`, `.write()`, `ConsoleLogger.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (5 nodes): `ArrayScriptedController`, `.constructor()`, `.isExhausted()`, `.next()`, `.reset()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (4 nodes): `DirectBehaviorRunner`, `.constructor()`, `.mapIntention()`, `.run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `js-son-agent.d.ts`, `Agent`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `Registry is deliberately local (no global singleton)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `defineSpecies validates duplicate need ids and lifecycle stages`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `Rationale: pull_request_target trigger gives write-capable token from forks safely`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `Rationale: global concurrency group prevents shipped-state race overwrites`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `Rationale: only flip when PR base is develop (avoids hotfix/main false-shipped)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `Rationale: surface non-404 read errors and write failures via hardFailures counter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `Rationale: never use git worktree add -B (force) â€” would silently rewind work`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Agent` connect `Community 0` to `Community 1`, `Community 6`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `map()` connect `Community 5` to `Community 0`, `Community 9`, `Community 2`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `Agent`, `Registry is deliberately local (no global singleton)`, `defineSpecies validates duplicate need ids and lifecycle stages` to the rest of the system?**
  _100 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._