import type { AgentAction } from '../../agent/AgentAction.js';
import type { RemoteController } from '../../agent/RemoteController.js';
import type { InputSourceLike } from './types.js';

/**
 * `RemoteController` backed by a pluggable keyboard/pointer source.
 * Consumers map engine input into `AgentAction[]` via a `translate`
 * callback; the resulting actions drive the agent when its control mode
 * is `'remote'`.
 *
 * Typical wiring:
 * ```ts
 * import { Engine, Keys } from 'excalibur';
 * const input: InputSourceLike = {
 *   keysPressed: () => [...engine.input.keyboard.getKeysPressed()].map(String),
 *   clicksSince: () => { ... },
 * };
 * const remote = new ExcaliburRemoteController(input, (keys, clicks) => {
 *   const actions: AgentAction[] = [];
 *   if (keys.includes('F')) actions.push({ type: 'invoke-skill', skillId: 'feed' });
 *   return actions;
 * });
 * ```
 */
export class ExcaliburRemoteController implements RemoteController {
  constructor(
    private readonly input: InputSourceLike,
    private readonly translate: (
      keys: readonly string[],
      clicks: readonly { x: number; y: number; button: 'left' | 'right' | 'middle' }[],
    ) => readonly AgentAction[],
  ) {}

  pull(_agentId: string, _wallNowMs: number): Promise<readonly AgentAction[]> {
    const keys = this.input.keysPressed();
    const clicks = this.input.clicksSince();
    return Promise.resolve(this.translate(keys, clicks));
  }
}
