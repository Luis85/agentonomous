import type { AgentAction } from '../../agent/AgentAction.js';
import type { Intention } from '../Intention.js';

/**
 * Translator from "what I want to do" (`Intention`) into "how I actually
 * do it" (`AgentAction[]`). The default runner is a table-driven lookup
 * (`DirectBehaviorRunner`); consumers can plug in richer runners — e.g.,
 * a mistreevous-backed behavior tree — through the same port.
 */
export interface BehaviorRunner {
  run(intention: Intention): readonly AgentAction[];
}
