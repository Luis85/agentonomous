import type { DomainEvent } from '../events/DomainEvent.js';
import type { Skill } from '../skills/Skill.js';
import type { AgentFacade } from './AgentFacade.js';

/**
 * A reactive handler: called for every event that matches its filter.
 * Return value is ignored; any agent state changes must go through the
 * `AgentFacade` verbs.
 *
 * @experimental — shape may change in 1.1 when the composable kernel
 * lands (see `docs/plans/2026-04-19-v1-comprehensive-plan.md#11--composable-kernel`).
 * Additions to this interface are minor bumps, not major.
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
 * @experimental — this interface reshapes in 1.1 (composable kernel:
 * `requires` / `provides` / `hooks` ordering, `serialize` / `restore`).
 * Additions are minor bumps. Prefer passing a list of `AgentModule`s
 * through `createAgent({ modules: [...] })` over reaching for the
 * underlying class directly.
 */
export interface AgentModule {
  id: string;
  /** Skills contributed by this module. */
  skills?: readonly Skill[];
  /** Tools contributed by this module. Kept `unknown[]` until the Tool interface ships. */
  tools?: readonly unknown[];
  /** Reactive handlers invoked when matching events arrive. */
  reactiveHandlers?: readonly ReactiveHandler[];
  /** Optional lifecycle hook run once during installation. */
  onInstall?(agent: AgentFacade): void;
}
