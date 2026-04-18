/**
 * Closed-enum-with-escape-hatch describing why an action is happening.
 *
 * - `express`   — purely reactive / cosmetic (meow, look sad). No state change
 *                 beyond emitting an event.
 * - `satisfy`   — active state-changing action (eat food, drink water).
 * - `idle`      — nothing to do right now.
 * - `react`     — responding to a specific perceived event.
 * - `do-task`   — executing a task from the queue (Phase B).
 * - `string & {}` escape hatch for consumer-defined kinds.
 */
export type IntentionKind = 'express' | 'satisfy' | 'idle' | 'react' | 'do-task' | (string & {});

/**
 * Structured description of "what I want to do next". Produced by
 * `NeedsPolicy` / reactive handlers / (Phase B) reasoners; consumed by the
 * `BehaviorRunner` to produce `AgentAction`s.
 */
export interface Intention {
  kind: IntentionKind;
  /** Specific kind-qualified string, e.g. `'satisfy-need:hunger'`. */
  type: string;
  /** Optional target id (item, other agent, location). */
  target?: string;
  /** Optional parameters for the behavior runner. */
  params?: Record<string, unknown>;
}
