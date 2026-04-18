import { describe, expect, it } from 'vitest';
import { createAgent } from '../../../src/agent/createAgent.js';
import { InvalidSpeciesError } from '../../../src/agent/errors.js';
import { defineSpecies } from '../../../src/species/defineSpecies.js';
import { SpeciesRegistry } from '../../../src/species/SpeciesRegistry.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';

describe('createAgent species integration', () => {
  it('accepts a SpeciesDescriptor directly', () => {
    const cat = defineSpecies({
      id: 'cat',
      persona: { traits: { playfulness: 0.9 } },
      needs: [{ id: 'hunger', level: 1, decayPerSec: 0.05 }],
      lifecycle: {
        schedule: [
          { stage: 'kitten', atSeconds: 0 },
          { stage: 'adult', atSeconds: 120 },
        ],
      },
      appearance: { shape: 'sprite', width: 64, height: 64, color: '#f80', visible: true },
      locomotion: 'walk',
    });
    const agent = createAgent({
      id: 'whiskers',
      species: cat,
      clock: new ManualClock(0),
      rng: 0,
    });

    expect(agent.identity.species).toBe('cat');
    expect(agent.identity.persona?.traits.playfulness).toBe(0.9);
    expect(agent.needs?.has('hunger')).toBe(true);
    expect(agent.ageModel?.stage).toBe('kitten');
    expect(agent.embodiment?.appearance.color).toBe('#f80');
    expect(agent.embodiment?.locomotion).toBe('walk');
  });

  it('resolves string species via speciesRegistry', () => {
    const registry = new SpeciesRegistry();
    registry.register(
      defineSpecies({
        id: 'cat',
        needs: [{ id: 'hunger', level: 1, decayPerSec: 0 }],
      }),
    );
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      speciesRegistry: registry,
      clock: new ManualClock(0),
      rng: 0,
    });
    expect(agent.needs?.has('hunger')).toBe(true);
  });

  it('passes through species that is neither registered nor a descriptor (bare string)', () => {
    const agent = createAgent({
      id: 'pet',
      species: 'cat',
      clock: new ManualClock(0),
      rng: 0,
    });
    expect(agent.identity.species).toBe('cat');
    expect(agent.needs).toBeUndefined();
  });

  it('applies species passive modifiers at construction', () => {
    const cat = defineSpecies({
      id: 'cat',
      passiveModifiers: [
        {
          id: 'feline-resilience',
          source: 'trait:hardy',
          appliedAt: 0,
          stack: 'replace',
          effects: [],
        },
      ],
    });
    const agent = createAgent({ id: 'pet', species: cat, clock: new ManualClock(0), rng: 0 });
    expect(agent.modifiers.has('feline-resilience')).toBe(true);
  });

  it('throws on an invalid species value', () => {
    expect(() =>
      createAgent({
        id: 'x',
        // @ts-expect-error — deliberate invalid type
        species: 42,
        clock: new ManualClock(0),
        rng: 0,
      }),
    ).toThrow(InvalidSpeciesError);
  });

  it('explicit config overrides take priority over species defaults', () => {
    const cat = defineSpecies({
      id: 'cat',
      needs: [{ id: 'hunger', level: 1, decayPerSec: 0.5 }],
      persona: { traits: { playfulness: 0.1 } },
    });
    const agent = createAgent({
      id: 'pet',
      species: cat,
      persona: { traits: { playfulness: 0.9 } },
      needs: [{ id: 'thirst', level: 1, decayPerSec: 0.05 }],
      clock: new ManualClock(0),
      rng: 0,
    });
    expect(agent.identity.persona?.traits.playfulness).toBe(0.9);
    expect(agent.needs?.has('thirst')).toBe(true);
    expect(agent.needs?.has('hunger')).toBe(false);
  });
});
