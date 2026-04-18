import { describe, expect, it } from 'vitest';
import type { AgentAction } from '../../../src/agent/AgentAction.js';
import { InMemoryRemoteController } from '../../../src/agent/RemoteController.js';

describe('InMemoryRemoteController', () => {
  it('returns an empty batch when nothing is queued', async () => {
    const controller = new InMemoryRemoteController();
    const pulled = await controller.pull('agent-1', 0);
    expect(pulled).toEqual([]);
  });

  it('dequeues batches in FIFO order', async () => {
    const controller = new InMemoryRemoteController();
    const first: AgentAction[] = [{ type: 'noop' }];
    const second: AgentAction[] = [{ type: 'invoke-skill', skillId: 'wave' }];
    const third: AgentAction[] = [{ type: 'invoke-skill', skillId: 'sit' }];

    controller.push(first);
    controller.push(second);
    controller.push(third);

    expect(await controller.pull('agent-1', 1)).toEqual(first);
    expect(await controller.pull('agent-1', 2)).toEqual(second);
    expect(await controller.pull('agent-1', 3)).toEqual(third);
    expect(await controller.pull('agent-1', 4)).toEqual([]);
  });

  it('resolves pull synchronously — the batch is dequeued before the promise resolves', () => {
    const controller = new InMemoryRemoteController();
    const batch: AgentAction[] = [{ type: 'noop' }];
    controller.push(batch);
    expect(controller.size).toBe(1);

    // Kick off the pull without awaiting; the queue should drain immediately.
    void controller.pull('agent-1', 0);
    expect(controller.size).toBe(0);
  });

  it('clear() drops all pending batches', async () => {
    const controller = new InMemoryRemoteController();
    controller.push([{ type: 'noop' }]);
    controller.push([{ type: 'noop' }]);
    expect(controller.size).toBe(2);

    controller.clear();
    expect(controller.size).toBe(0);
    expect(await controller.pull('agent-1', 0)).toEqual([]);
  });

  it('preserves batch contents (does not merge across pushes)', async () => {
    const controller = new InMemoryRemoteController();
    controller.push([{ type: 'noop' }, { type: 'noop' }]);
    controller.push([{ type: 'invoke-skill', skillId: 'bark' }]);

    const firstBatch = await controller.pull('agent-1', 0);
    expect(firstBatch).toHaveLength(2);

    const secondBatch = await controller.pull('agent-1', 0);
    expect(secondBatch).toEqual([{ type: 'invoke-skill', skillId: 'bark' }]);
  });
});
