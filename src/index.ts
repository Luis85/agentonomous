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

// Events.
export type { DomainEvent } from './events/DomainEvent.js';

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
