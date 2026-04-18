import { describe, expect, it } from 'vitest';
import type { AgentAction } from '../../../src/agent/AgentAction.js';
import { ArrayScriptedController } from '../../../src/agent/ScriptedController.js';

describe('ArrayScriptedController', () => {
  it('returns each scripted entry in order', () => {
    const first: AgentAction[] = [{ type: 'noop' }];
    const second: AgentAction[] = [{ type: 'invoke-skill', skillId: 'sit' }];
    const third: AgentAction[] = [{ type: 'invoke-skill', skillId: 'fetch' }, { type: 'noop' }];
    const controller = new ArrayScriptedController([first, second, third]);

    expect(controller.next('agent-1', 0)).toEqual(first);
    expect(controller.next('agent-1', 1)).toEqual(second);
    expect(controller.next('agent-1', 2)).toEqual(third);
  });

  it('returns null after the script is exhausted', () => {
    const controller = new ArrayScriptedController([[{ type: 'noop' }]]);

    expect(controller.next('agent-1', 0)).toEqual([{ type: 'noop' }]);
    expect(controller.isExhausted).toBe(true);
    expect(controller.next('agent-1', 1)).toBeNull();
    expect(controller.next('agent-1', 2)).toBeNull();
  });

  it('returns null immediately for an empty script', () => {
    const controller = new ArrayScriptedController([]);
    expect(controller.isExhausted).toBe(true);
    expect(controller.next('agent-1', 0)).toBeNull();
  });

  it('allows empty action batches as script entries', () => {
    const controller = new ArrayScriptedController([[], [{ type: 'noop' }]]);
    expect(controller.next('agent-1', 0)).toEqual([]);
    expect(controller.next('agent-1', 1)).toEqual([{ type: 'noop' }]);
    expect(controller.next('agent-1', 2)).toBeNull();
  });

  it('reset() rewinds so the script replays from the beginning', () => {
    const first: AgentAction[] = [{ type: 'invoke-skill', skillId: 'a' }];
    const second: AgentAction[] = [{ type: 'invoke-skill', skillId: 'b' }];
    const controller = new ArrayScriptedController([first, second]);

    expect(controller.next('agent-1', 0)).toEqual(first);
    expect(controller.next('agent-1', 1)).toEqual(second);
    expect(controller.next('agent-1', 2)).toBeNull();

    controller.reset();

    expect(controller.isExhausted).toBe(false);
    expect(controller.next('agent-1', 3)).toEqual(first);
    expect(controller.next('agent-1', 4)).toEqual(second);
    expect(controller.next('agent-1', 5)).toBeNull();
  });
});
