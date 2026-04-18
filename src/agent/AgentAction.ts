import type { DomainEvent } from '../events/DomainEvent.js';

/**
 * Action selected by the behavior runner and executed during a tick.
 *
 * Common kinds are typed; the escape hatch `(string & {})` lets consumers
 * introduce custom action kinds without a library version bump.
 */
export type AgentAction =
  | { type: 'invoke-skill'; skillId: string; params?: Record<string, unknown> }
  | { type: 'emit-event'; event: DomainEvent }
  | { type: 'noop' }
  | ({ type: string & {} } & Record<string, unknown>);

/** Narrowing helper: invoke-skill. */
export function isInvokeSkillAction(
  a: AgentAction,
): a is Extract<AgentAction, { type: 'invoke-skill' }> {
  return a.type === 'invoke-skill';
}

/** Narrowing helper: emit-event. */
export function isEmitEventAction(
  a: AgentAction,
): a is Extract<AgentAction, { type: 'emit-event' }> {
  return a.type === 'emit-event';
}
