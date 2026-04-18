import { describe, expect, it } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import { defaultEmbodiment } from '../../../src/body/Embodiment.js';
import { ExcaliburAgentActor } from '../../../src/integrations/excalibur/ExcaliburAgentActor.js';
import type { ActorLike } from '../../../src/integrations/excalibur/types.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

function makeStubActor(): ActorLike {
  return {
    pos: { x: -999, y: -999 },
    rotation: -999,
    scale: { x: -999, y: -999 },
    graphics: { use: () => {} },
  };
}

describe('ExcaliburAgentActor', () => {
  it('syncs transform position, rotation, scale onto the actor', () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
      embodiment: defaultEmbodiment({
        transform: {
          position: { x: 10, y: 20, z: 0 },
          rotation: { x: 0, y: 0, z: 1.5 },
          scale: { x: 2, y: 3, z: 1 },
        },
      }),
    });
    const actor = makeStubActor();
    const binding = new ExcaliburAgentActor(agent, actor);

    binding.sync();

    expect(actor.pos).toEqual({ x: 10, y: 20 });
    expect(actor.rotation).toBe(1.5);
    expect(actor.scale.x).toBe(2);
    expect(actor.scale.y).toBe(3);
  });

  it('is a no-op when the agent has no embodiment', () => {
    const agent = createAgent({ id: 'pet', species: 'cat', clock: new ManualClock(0), rng: 0 });
    const actor = makeStubActor();
    const binding = new ExcaliburAgentActor(agent, actor);

    binding.sync();

    expect(actor.pos.x).toBe(-999);
  });
});
