import type { AgentAction } from '../../agent/AgentAction.js';
import type { Intention } from '../Intention.js';

/**
 * Translator from "what I want to do" (`Intention`) into "how I actually do
 * it" (`AgentAction[]`). Default Phase A is a table-driven lookup
 * (`DirectBehaviorRunner`); Phase B swaps in `MistreevousBehavior` for
 * real behavior trees.
 */
export interface BehaviorRunner {
  run(intention: Intention): readonly AgentAction[];
}
