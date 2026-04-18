import type { AgentAction } from '../../agent/AgentAction.js';
import type { Intention } from '../Intention.js';
import type { BehaviorRunner } from './BehaviorRunner.js';

/**
 * Options for `DirectBehaviorRunner`.
 *
 * `skillByIntentionType` maps intention `type` strings to skill ids. When
 * an intention fires and a mapping exists, the runner emits a single
 * `{ type: 'invoke-skill', skillId, params }` action.
 *
 * `fallback` handles intentions without a mapping. The default emits
 * `{ type: 'noop' }`.
 */
export interface DirectBehaviorRunnerOptions {
  skillByIntentionType?: Readonly<Record<string, string>>;
  fallback?: (intention: Intention) => readonly AgentAction[];
}

/**
 * Phase A default behavior runner. Lookup-table translation from intention
 * to invoke-skill actions. Keeps the MVP nurture-pet's mental model
 * straightforward: "satisfy-need:hunger" → invoke "feed-self"; consumers
 * declare whatever mappings they need in their species module.
 */
export class DirectBehaviorRunner implements BehaviorRunner {
  private readonly table: Readonly<Record<string, string>>;
  private readonly fallback: (intention: Intention) => readonly AgentAction[];

  constructor(opts: DirectBehaviorRunnerOptions = {}) {
    this.table = opts.skillByIntentionType ?? {};
    this.fallback = opts.fallback ?? (() => [{ type: 'noop' }]);
  }

  run(intention: Intention): readonly AgentAction[] {
    const skillId = this.table[intention.type];
    if (skillId === undefined) return this.fallback(intention);
    return [
      {
        type: 'invoke-skill',
        skillId,
        ...(intention.params !== undefined ? { params: intention.params } : {}),
      },
    ];
  }

  /** Register or override a mapping at runtime. Useful for consumer modules. */
  mapIntention(intentionType: string, skillId: string): void {
    // Mutating a readonly-typed table via indexed assignment is fine at
    // runtime; we narrow the type back to its public shape immediately.
    (this.table as Record<string, string>)[intentionType] = skillId;
  }
}
