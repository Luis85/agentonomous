import type { DomainEvent } from '../events/DomainEvent.js';

/**
 * Published by `agent.interact(verb, params)`. Reactive handlers route
 * these to concrete skills (see the `Interaction` module — M7 wires a
 * default router; for M2 the event exists as a canonical envelope).
 */
export type InteractionRequestedEvent = DomainEvent & {
  type: 'InteractionRequested';
  agentId: string;
  verb: string;
  params?: Record<string, unknown>;
};

export const INTERACTION_REQUESTED = 'InteractionRequested' as const;
