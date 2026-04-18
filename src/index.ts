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
export {
  ExpressiveNeedsPolicy,
  type ExpressiveNeedsPolicyOptions,
} from './needs/ExpressiveNeedsPolicy.js';
export { ActiveNeedsPolicy, type ActiveNeedsPolicyOptions } from './needs/ActiveNeedsPolicy.js';
export { ComposedNeedsPolicy } from './needs/ComposedNeedsPolicy.js';

// Cognition types (full reasoner/behavior lands in M7).
export type { Intention, IntentionKind } from './cognition/Intention.js';
export type { IntentionCandidate } from './cognition/IntentionCandidate.js';

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
export { DefaultMoodModel } from './mood/DefaultMoodModel.js';

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
  type NeedCriticalEvent,
  type NeedSafeEvent,
  type NeedSatisfiedEvent,
  type ModifierAppliedEvent,
  type ModifierExpiredEvent,
  type ModifierRemovedEvent,
  type LifeStageChangedEvent,
  type AgentDiedEvent,
  type MoodChangedEvent,
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
