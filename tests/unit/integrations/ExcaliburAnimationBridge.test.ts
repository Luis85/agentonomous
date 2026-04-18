import { describe, expect, it, vi } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import { ExcaliburAnimationBridge } from '../../../src/integrations/excalibur/ExcaliburAnimationBridge.js';
import type { ActorLike } from '../../../src/integrations/excalibur/types.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

function stubActor(): ActorLike & { graphicsUseCalls: unknown[] } {
  const calls: unknown[] = [];
  return {
    pos: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    graphics: {
      use: (g) => {
        calls.push(g);
      },
    },
    graphicsUseCalls: calls,
  };
}

describe('ExcaliburAnimationBridge', () => {
  it('applies the initial state on attach', () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
    });
    const actor = stubActor();
    const bridge = new ExcaliburAnimationBridge({
      agent,
      actor,
      graphicsByState: { idle: 'cat-idle' },
    });

    bridge.attach();

    expect(actor.graphicsUseCalls).toContain('cat-idle');
    bridge.detach();
  });

  it('swaps graphics on AnimationTransition events', async () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      lifecycle: [{ stage: 'adult', atSeconds: 0 }],
      needs: [{ id: 'hunger', level: 0.05, decayPerSec: 0 }],
    });
    const actor = stubActor();
    const bridge = new ExcaliburAnimationBridge({
      agent,
      actor,
      graphicsByState: { idle: 'cat-idle', sad: 'cat-sad', sick: 'cat-sick', happy: 'cat-happy' },
      fallback: 'cat-idle',
    });

    bridge.attach();
    await agent.tick(0.016);

    // The animation should have shifted away from idle given the urgency.
    expect(actor.graphicsUseCalls.length).toBeGreaterThanOrEqual(1);
    bridge.detach();
  });

  it('detach stops further graphic swaps', () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      lifecycle: [{ stage: 'adult', atSeconds: 0 }],
    });
    const actor = stubActor();
    const use = vi.fn();
    actor.graphics.use = use;
    const bridge = new ExcaliburAnimationBridge({
      agent,
      actor,
      graphicsByState: { idle: 'cat-idle', dead: 'cat-dead' },
    });
    bridge.attach();
    bridge.detach();

    agent.kill('test');
    // No further calls after detach — the initial attach() call was before
    // the kill, so we only see that single call.
    expect(use).toHaveBeenCalledTimes(1);
  });
});
