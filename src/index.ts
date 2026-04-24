// Public barrel — populated incrementally through Phase A milestones.
// The library's V1 / MVP target is a virtual-pet nurture demo: nurture an
// agent from birth to death, feed and interact with it, watch it react
// and act autonomously between inputs.

export const VERSION = '0.0.0';

// Identity, role, species, persona.
export type { AgentIdentity } from './agent/AgentIdentity.js';
export type { AgentRole } from './agent/AgentRole.js';
export type { Species } from './agent/Species.js';
export type { Persona } from './agent/Persona.js';
export type { AgentInput, AgentOutput } from './agent/types.js';
export type { ControlMode } from './agent/ControlMode.js';

// Agent core.
export { Agent, type AgentDependencies } from './agent/Agent.js';
export { createAgent, type CreateAgentConfig } from './agent/createAgent.js';
export type { AgentFacade } from './agent/AgentFacade.js';
export type { AgentModule, ReactiveHandler } from './agent/AgentModule.js';
export type { DecisionTrace } from './agent/DecisionTrace.js';
export { type AgentAction, isInvokeSkillAction, isEmitEventAction } from './agent/AgentAction.js';

// Errors + Result.
export {
  AgentError,
  MissingDependencyError,
  SnapshotRestoreError,
  InvalidSpeciesError,
  SkillInvocationError,
  BudgetExceededError,
} from './agent/errors.js';
export { type Result, ok, err, isOk, isErr, map, mapErr, andThen, unwrap } from './agent/result.js';

// Events.
export type { DomainEvent } from './events/DomainEvent.js';
export type { EventBusPort } from './events/EventBusPort.js';
export { InMemoryEventBus } from './events/InMemoryEventBus.js';
export {
  type InteractionRequestedEvent,
  INTERACTION_REQUESTED,
} from './interaction/InteractionRequestedEvent.js';

// Persistence state slice (full persistence lands in M10).
export type { AgentState } from './persistence/AgentState.js';

// Needs (M3).
export type { Need, NeedsDelta } from './needs/Need.js';
export { DEFAULT_URGENCY_CURVE } from './needs/Need.js';
export { Needs, type DecayMultiplierFn } from './needs/Needs.js';
export type { NeedsPolicy } from './needs/NeedsPolicy.js';
/** Needs policy that emits expressive intentions ("meow", "look sad") when a need is critical; no side effects. */
export {
  ExpressiveNeedsPolicy,
  type ExpressiveNeedsPolicyOptions,
} from './needs/ExpressiveNeedsPolicy.js';
/** Needs policy that emits state-changing "satisfy-need" intentions — the autonomous-action cousin of `ExpressiveNeedsPolicy`. */
export { ActiveNeedsPolicy, type ActiveNeedsPolicyOptions } from './needs/ActiveNeedsPolicy.js';
/** Composite policy that fans a needs context out to multiple child policies and concatenates their candidates. */
export { ComposedNeedsPolicy } from './needs/ComposedNeedsPolicy.js';

// Cognition (M3 types + M7 defaults + ports).
export type { Intention, IntentionKind } from './cognition/Intention.js';
export type { IntentionCandidate } from './cognition/IntentionCandidate.js';
export { defaultPersonaBias, type PersonaBiasFn } from './cognition/personaBias.js';
export type { Reasoner, ReasonerContext } from './cognition/reasoning/Reasoner.js';
/** Reasoner that picks no intention. Default when no `Reasoner` is wired. */
export { NoopReasoner } from './cognition/reasoning/NoopReasoner.js';
/** Default weighted-scoring reasoner: applies persona bias + modifier bonus, picks the highest-scoring intention above a threshold. */
export {
  UrgencyReasoner,
  type UrgencyReasonerOptions,
} from './cognition/reasoning/UrgencyReasoner.js';
export type { BehaviorRunner } from './cognition/behavior/BehaviorRunner.js';
/** Table-driven behavior runner: maps `Intention` ids to concrete `AgentAction[]` via a consumer-supplied lookup. */
export {
  DirectBehaviorRunner,
  type DirectBehaviorRunnerOptions,
} from './cognition/behavior/DirectBehaviorRunner.js';
/** Behavior runner that produces no actions. Default when no runner is wired. */
export { NoopBehavior } from './cognition/behavior/NoopBehavior.js';
export type { Learner, LearningOutcome } from './cognition/learning/Learner.js';
/** Learner that ignores outcomes. Default when no learner is wired. */
export { NoopLearner } from './cognition/learning/NoopLearner.js';

// Tuning constants.
export {
  MOOD_URGENCY_THRESHOLDS,
  PERSONA_TRAIT_WEIGHTS,
  SKILL_DEFAULTS,
  OFFLINE_CATCHUP_DEFAULTS,
  EXPRESSIVE_POLICY_DEFAULTS,
} from './cognition/tuning.js';

// Skills (M7).
export type { Skill, SkillOutcome, SkillError } from './skills/Skill.js';
export type { SkillContext } from './skills/SkillContext.js';
export { SkillRegistry } from './skills/SkillRegistry.js';

// Default skill library (M7).
export {
  defaultPetInteractionModule,
  defaultActiveSkills,
  defaultExpressionSkills,
  FeedSkill,
  CleanSkill,
  PlaySkill,
  RestSkill,
  ScoldSkill,
  PetSkill,
  MedicateSkill,
  ExpressMeowSkill,
  ExpressSadSkill,
  ExpressSleepySkill,
} from './skills/defaults/index.js';

// Animation (M8).
export type { AnimationState } from './animation/AnimationState.js';
export {
  type AnimationTransitionEvent,
  ANIMATION_TRANSITION,
} from './animation/AnimationTransitionEvent.js';
export {
  AnimationStateMachine,
  type AnimationStateMachineOptions,
  type AnimationTransition,
  type ReconcileContext,
} from './animation/AnimationStateMachine.js';

// Lifecycle (M5).
export type { LifeStage } from './lifecycle/LifeStage.js';
export { DECEASED_STAGE } from './lifecycle/LifeStage.js';
export type { LifeStageSchedule, LifeStageScheduleEntry } from './lifecycle/LifeStageSchedule.js';
export { AgeModel, type AgeModelOptions, type LifeStageTransition } from './lifecycle/AgeModel.js';
export {
  defineLifecycle,
  type LifecycleTemplate,
  type LifecycleDescriptor,
} from './lifecycle/defineLifecycle.js';
export {
  stageAllowsSkill,
  type StageCapabilityRule,
  type StageCapabilityMap,
} from './lifecycle/StageCapabilities.js';

// Mood (M5).
export type { Mood, MoodCategory } from './mood/Mood.js';
export type { MoodModel, MoodEvaluationContext } from './mood/MoodModel.js';
/** Default mood model: blends normalized needs + modifier bias to pick a `MoodCategory` ({ happy, sad, playful, sleepy, bored, sick }). */
export { DefaultMoodModel } from './mood/DefaultMoodModel.js';

// Control modes (M6).
export { InMemoryRemoteController, type RemoteController } from './agent/RemoteController.js';
export { ArrayScriptedController, type ScriptedController } from './agent/ScriptedController.js';

// Species (M12).
export type { SpeciesDescriptor } from './species/SpeciesDescriptor.js';
export { defineSpecies } from './species/defineSpecies.js';
export { SpeciesRegistry } from './species/SpeciesRegistry.js';

// Body (M9).
export {
  type Vector3Like,
  type Transform,
  identityTransform,
  translate,
} from './body/Transform.js';
export type { LocomotionMode } from './body/LocomotionMode.js';
export { type Appearance, type AgentShape, defaultAppearance } from './body/Appearance.js';
export { type Embodiment, defaultEmbodiment } from './body/Embodiment.js';

// Memory (M10).
export type { MemoryKind, MemoryRecord } from './memory/MemoryRecord.js';
export type { MemoryFilter, MemoryRepository } from './memory/MemoryRepository.js';
export { InMemoryMemoryAdapter } from './memory/InMemoryMemoryAdapter.js';

// Persistence (M10).
export {
  type AgentSnapshot,
  type SnapshotPart,
  CURRENT_SNAPSHOT_VERSION,
} from './persistence/AgentSnapshot.js';
export type { SnapshotStorePort } from './persistence/SnapshotStorePort.js';
export { InMemorySnapshotStore } from './persistence/InMemorySnapshotStore.js';
export {
  LocalStorageSnapshotStore,
  type LocalStorageSnapshotStoreOptions,
  type StorageLike,
} from './persistence/LocalStorageSnapshotStore.js';
export {
  FsSnapshotStore,
  type FsSnapshotStoreOptions,
  type FsAdapter,
} from './persistence/FsSnapshotStore.js';
export { pickDefaultSnapshotStore } from './persistence/pickDefaultSnapshotStore.js';
export {
  AutoSaveTracker,
  DEFAULT_AUTOSAVE_POLICY,
  type AutoSavePolicy,
} from './persistence/AutoSavePolicy.js';
export {
  runCatchUp,
  type CatchUpOptions,
  type CatchUpResult,
} from './persistence/offlineCatchUp.js';
export {
  migrateSnapshot,
  type SnapshotMigration,
  SNAPSHOT_MIGRATIONS,
} from './persistence/migrateSnapshot.js';
export {
  bindAgentToStore,
  type AgentStateListener,
  type BindOptions,
} from './persistence/StoreBinding.js';

// Random events (M11).
export {
  defineRandomEvent,
  type RandomEventContext,
  type RandomEventDef,
} from './randomEvents/defineRandomEvent.js';
export {
  RandomEventTicker,
  type RandomEventTickOptions,
} from './randomEvents/RandomEventTicker.js';
export { withFxHint, getFxHint } from './randomEvents/fxHint.js';

// Modifiers (M4).
export type { Modifier, ModifierStackPolicy } from './modifiers/Modifier.js';
export type { ModifierEffect } from './modifiers/ModifierEffect.js';
export type { ModifierTarget } from './modifiers/ModifierTarget.js';
export { Modifiers, type ModifierRemoval } from './modifiers/Modifiers.js';
export {
  defineModifier,
  type ModifierTemplate,
  type ModifierBlueprint,
} from './modifiers/defineModifier.js';

// Standard event constants/types.
export {
  NEED_CRITICAL,
  NEED_SAFE,
  NEED_SATISFIED,
  MODIFIER_APPLIED,
  MODIFIER_EXPIRED,
  MODIFIER_REMOVED,
  LIFE_STAGE_CHANGED,
  AGENT_DIED,
  MOOD_CHANGED,
  SKILL_COMPLETED,
  SKILL_FAILED,
  AGENT_TICKED,
  type NeedCriticalEvent,
  type NeedSafeEvent,
  type NeedSatisfiedEvent,
  type ModifierAppliedEvent,
  type ModifierExpiredEvent,
  type ModifierRemovedEvent,
  type LifeStageChangedEvent,
  type AgentDiedEvent,
  type MoodChangedEvent,
  type SkillCompletedEvent,
  type SkillFailedEvent,
  type AgentTickedEvent,
} from './events/standardEvents.js';

// Ports — the determinism seams.
export type { WallClock } from './ports/WallClock.js';
export { SystemClock } from './ports/SystemClock.js';
export { ManualClock } from './ports/ManualClock.js';
export type { Rng } from './ports/Rng.js';
export { SeededRng } from './ports/SeededRng.js';
export type { Logger } from './ports/Logger.js';
export { NullLogger } from './ports/Logger.js';
export {
  ConsoleLogger,
  type ConsoleLoggerOptions,
  type ConsoleLogLevel,
} from './ports/ConsoleLogger.js';
export type { Validator, ValidationResult, ValidationIssue } from './ports/Validator.js';
export { PassthroughValidator } from './ports/Validator.js';
export type {
  LlmRole,
  LlmCacheHint,
  LlmMessage,
  LlmBudget,
  LlmCompleteOptions,
  LlmUsage,
  LlmCompletion,
  LlmProviderPort,
} from './ports/LlmProviderPort.js';
/** Deterministic `LlmProviderPort` for tests / golden replays — no RNG, no clock, no network. */
export {
  MockLlmProvider,
  type MockLlmProviderOptions,
  type MockLlmScript,
} from './ports/MockLlmProvider.js';
