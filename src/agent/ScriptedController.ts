import type { AgentAction } from './AgentAction.js';

/**
 * Port: feeds pre-canned `AgentAction` batches to the agent when it is in
 * `'scripted'` control mode. Each call to `next(...)` yields the batch for
 * the current tick; returning `null` signals the script has finished and
 * the agent should treat the tick as a no-op (cognition stays skipped —
 * callers may choose to flip the agent back to `'autonomous'`).
 *
 * Introduced in M6. Primarily aimed at deterministic integration tests and
 * pre-recorded demos.
 */
export type ScriptedController = {
  /**
   * Advance the script one step. Returns the next batch of actions, or
   * `null` if the script has been exhausted.
   */
  next(agentId: string, wallNowMs: number): readonly AgentAction[] | null;
};

/**
 * Array-backed `ScriptedController` used by tests. Accepts a fixed script
 * at construction time and emits each entry in order; once exhausted, all
 * further calls return `null`. `reset()` rewinds the cursor so the same
 * script can be replayed.
 */
export class ArrayScriptedController implements ScriptedController {
  private readonly script: readonly (readonly AgentAction[])[];
  private cursor = 0;

  constructor(script: readonly (readonly AgentAction[])[]) {
    this.script = script;
  }

  /**
   * Return the script entry at the current cursor (advancing it) or `null`
   * if the script has been exhausted. `agentId` / `wallNowMs` are accepted
   * to match the port shape but ignored.
   */
  next(_agentId: string, _wallNowMs: number): readonly AgentAction[] | null {
    if (this.cursor >= this.script.length) return null;
    const entry = this.script[this.cursor++];
    return entry ?? null;
  }

  /** Rewind the cursor so the script replays from the beginning. */
  reset(): void {
    this.cursor = 0;
  }

  /** `true` once every entry has been emitted. */
  get isExhausted(): boolean {
    return this.cursor >= this.script.length;
  }
}
