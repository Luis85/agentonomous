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
