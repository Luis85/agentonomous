import { describe, expect, it } from 'vitest';
import { ExcaliburRemoteController } from '../../../src/integrations/excalibur/ExcaliburRemoteController.js';
import type { InputSourceLike } from '../../../src/integrations/excalibur/types.js';

describe('ExcaliburRemoteController', () => {
  it('translates input into AgentActions', async () => {
    let keyState: readonly string[] = [];
    const input: InputSourceLike = {
      keysPressed: () => keyState,
      clicksSince: () => [],
    };
    const remote = new ExcaliburRemoteController(input, (keys) => {
      if (keys.includes('F')) return [{ type: 'invoke-skill', skillId: 'feed' }];
      return [];
    });

    expect(await remote.pull('pet', 0)).toEqual([]);
    keyState = ['F'];
    expect(await remote.pull('pet', 0)).toEqual([{ type: 'invoke-skill', skillId: 'feed' }]);
  });

  it('forwards clicks to the translator', async () => {
    const click = { x: 100, y: 200, button: 'left' as const };
    const input: InputSourceLike = {
      keysPressed: () => [],
      clicksSince: () => [click],
    };
    const remote = new ExcaliburRemoteController(input, (_keys, clicks) => {
      if (clicks.length === 0) return [];
      return [{ type: 'invoke-skill', skillId: 'pet' }];
    });
    expect(await remote.pull('pet', 0)).toEqual([{ type: 'invoke-skill', skillId: 'pet' }]);
  });
});
