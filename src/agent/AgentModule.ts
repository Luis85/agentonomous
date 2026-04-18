import type { DomainEvent } from '../events/DomainEvent.js';
import type { AgentFacade } from './AgentFacade.js';

/**
 * A reactive handler: called for every event that matches its filter.
 * Return value is ignored; any agent state changes must go through the
 * `AgentFacade` verbs.
 */
export interface ReactiveHandler {
  /**
   * Event type string to match against `DomainEvent.type`, or the literal
   * `'*'` wildcard for all events. No globbing yet.
   */
  on: string;
  /** Handler invoked when the filter matches. */
  handle(event: DomainEvent, agent: AgentFacade): void | Promise<void>;
}

/**
 * A plugin bundle registered with the agent. Lets consumers package related
 * skills, tools, reactive handlers, and event schemas into one installable
 * unit instead of wiring each individually.
 *
 * `Skill` / `Tool` land in M7; this interface already names the slots so
 * later milestones just add concrete implementations.
 */
export interface AgentModule {
  id: string;
  /** Skills contributed by this module. Phase A: M7. */
  skills?: readonly unknown[];
  /** Tools contributed by this module. Phase A: M7. */
  tools?: readonly unknown[];
  /** Reactive handlers invoked when matching events arrive. */
  reactiveHandlers?: readonly ReactiveHandler[];
  /** Optional lifecycle hook run once during installation. */
  onInstall?(agent: AgentFacade): void;
}
