import type { DomainEvent } from '../events/DomainEvent.js';

/**
 * Data pushed into an agent from the host at `receive()` time. Reserved for
 * explicit, non-tick ingress (e.g., text prompts in chat-driven sims).
 *
 * Regular event-driven input flows through the event bus instead; tick
 * ordering stays deterministic that way.
 */
export type AgentInput = {
  /** Freeform text — common for LLM-driven or conversational agents. */
  text?: string;
  /** Events to publish atomically with this receive cycle. */
  events?: readonly DomainEvent[];
  /** Consumer-specific extension payload. */
  custom?: Record<string, unknown>;
};

/**
 * Result of a `receive()` call. Mirrors the structure of a tick result but
 * is shaped for one-shot request/response flows rather than game loops.
 */
export type AgentOutput = {
  /** Events the agent emitted in response. */
  emittedEvents: readonly DomainEvent[];
  /** Consumer-specific response payload. */
  custom?: Record<string, unknown>;
};
