import type { AgentAction } from '../../agent/AgentAction.js';
import type { BehaviorRunner } from './BehaviorRunner.js';

/** Always emits a single `noop` action. Useful for tests. */
export class NoopBehavior implements BehaviorRunner {
  run(): readonly AgentAction[] {
    return [{ type: 'noop' }];
  }
}
