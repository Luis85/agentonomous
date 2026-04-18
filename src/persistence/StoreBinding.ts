import type { Agent } from '../agent/Agent.js';
import type { DomainEvent } from '../events/DomainEvent.js';
import type { AgentState } from './AgentState.js';

/**
 * Framework-agnostic reactive store adapter pattern. Consumers typically
 * wire this up once in their UI layer:
 *
 * ```ts
 * // Pinia
 * const store = usePetStore();
 * const unsub = bindAgentToStore(pet, (state) => store.syncFromAgent(state));
 * ```
 *
 * The helper subscribes to every event on the agent's bus and pushes a
 * fresh `getState()` projection into the consumer's store. It's
 * intentionally minimal — any reactive framework (Pinia, Zustand, Redux,
 * Svelte stores, signals, React atoms) can plug in via the callback.
 */
export type AgentStateListener = (state: AgentState, event: DomainEvent) => void;

export interface BindOptions {
  /**
   * Emit an initial state snapshot synchronously. Defaults to `true` so the
   * consumer store is hydrated before any event arrives.
   */
  emitInitial?: boolean;
}

/**
 * Subscribe to agent state changes, invoking `listener` on every event
 * with the current `getState()` slice. Returns an unsubscribe function.
 */
export function bindAgentToStore(
  agent: Agent,
  listener: AgentStateListener,
  opts: BindOptions = {},
): () => void {
  if (opts.emitInitial !== false) {
    listener(agent.getState(), { type: '__init__', at: agent.clock.now() });
  }
  return agent.subscribe((event) => {
    listener(agent.getState(), event);
  });
}
