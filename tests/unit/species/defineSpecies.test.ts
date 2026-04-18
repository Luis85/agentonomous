import { describe, expect, it } from 'vitest';
import { defineSpecies } from '../../../src/species/defineSpecies.js';
import { InvalidSpeciesError } from '../../../src/agent/errors.js';

describe('defineSpecies', () => {
  it('accepts a minimal descriptor and stamps version 1', () => {
    const d = defineSpecies({ id: 'cat' });
    expect(d.id).toBe('cat');
    expect(d.version).toBe(1);
  });

  it('rejects empty id', () => {
    expect(() => defineSpecies({ id: '' })).toThrow(InvalidSpeciesError);
  });

  it('rejects duplicate need ids', () => {
    expect(() =>
      defineSpecies({
        id: 'cat',
        needs: [
          { id: 'hunger', level: 1, decayPerSec: 0 },
          { id: 'hunger', level: 1, decayPerSec: 0 },
        ],
      }),
    ).toThrow(/duplicate need id 'hunger'/);
  });

  it('rejects duplicate lifecycle stages', () => {
    expect(() =>
      defineSpecies({
        id: 'cat',
        lifecycle: {
          schedule: [
            { stage: 'adult', atSeconds: 0 },
            { stage: 'adult', atSeconds: 10 },
          ],
        },
      }),
    ).toThrow(/duplicate lifecycle stage 'adult'/);
  });

  it('preserves persona, passiveModifiers, appearance, locomotion', () => {
    const d = defineSpecies({
      id: 'cat',
      persona: { traits: { playfulness: 0.8 } },
      passiveModifiers: [
        {
          id: 'resilient',
          source: 'trait:hardy',
          appliedAt: 0,
          stack: 'replace',
          effects: [],
        },
      ],
      appearance: { shape: 'sprite', width: 64, height: 64, color: '#fff', visible: true },
      locomotion: 'walk',
    });
    expect(d.persona?.traits.playfulness).toBe(0.8);
    expect(d.passiveModifiers).toHaveLength(1);
    expect(d.appearance?.width).toBe(64);
    expect(d.locomotion).toBe('walk');
  });
});
