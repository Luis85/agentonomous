import { describe, expect, it } from 'vitest';
import { DirectBehaviorRunner } from '../../../../src/cognition/behavior/DirectBehaviorRunner.js';

describe('DirectBehaviorRunner.run — R-28 coverage', () => {
  it('falls back to a noop action when no mapping is registered', () => {
    const runner = new DirectBehaviorRunner();
    const actions = runner.run({ kind: 'satisfy', type: 'eat' });
    expect(actions).toEqual([{ type: 'noop' }]);
  });

  it('emits an invoke-skill action when a mapping exists', () => {
    const runner = new DirectBehaviorRunner({
      skillByIntentionType: { 'satisfy-need:hunger': 'feed' },
    });
    const actions = runner.run({ kind: 'satisfy', type: 'satisfy-need:hunger' });
    expect(actions).toEqual([{ type: 'invoke-skill', skillId: 'feed' }]);
  });

  it('forwards intention.params into the action', () => {
    const runner = new DirectBehaviorRunner({
      skillByIntentionType: { 'consume-food': 'feed' },
    });
    const actions = runner.run({
      kind: 'satisfy',
      type: 'consume-food',
      params: { item: 'kibble' },
    });
    expect(actions).toEqual([
      { type: 'invoke-skill', skillId: 'feed', params: { item: 'kibble' } },
    ]);
  });

  it('custom fallback is invoked when no mapping is set', () => {
    const runner = new DirectBehaviorRunner({
      fallback: (intention) => [
        {
          type: 'emit-event',
          event: { type: 'UnhandledIntention', at: 0, intentionType: intention.type },
        },
      ],
    });
    const actions = runner.run({ kind: 'react', type: 'hear-noise' });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe('emit-event');
  });

  it('mapIntention registers a mapping at runtime', () => {
    const runner = new DirectBehaviorRunner();
    expect(runner.run({ kind: 'express', type: 'meow' })).toEqual([{ type: 'noop' }]);
    runner.mapIntention('meow', 'express-meow');
    expect(runner.run({ kind: 'express', type: 'meow' })).toEqual([
      { type: 'invoke-skill', skillId: 'express-meow' },
    ]);
  });

  it('mapIntention overrides an existing mapping', () => {
    const runner = new DirectBehaviorRunner({
      skillByIntentionType: { fight: 'claws' },
    });
    runner.mapIntention('fight', 'bite');
    const actions = runner.run({ kind: 'react', type: 'fight' });
    expect(actions).toEqual([{ type: 'invoke-skill', skillId: 'bite' }]);
  });
});
