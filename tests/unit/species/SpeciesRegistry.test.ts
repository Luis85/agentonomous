import { describe, expect, it } from 'vitest';
import { SpeciesRegistry } from '../../../src/species/SpeciesRegistry.js';
import { defineSpecies } from '../../../src/species/defineSpecies.js';
import { InvalidSpeciesError } from '../../../src/agent/errors.js';

describe('SpeciesRegistry', () => {
  it('registers + looks up by id', () => {
    const reg = new SpeciesRegistry();
    reg.register(defineSpecies({ id: 'cat' }));
    reg.register(defineSpecies({ id: 'dog' }));

    expect(reg.has('cat')).toBe(true);
    expect(reg.get('cat')?.id).toBe('cat');
    expect(
      reg
        .list()
        .map((d) => d.id)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    ).toEqual(['cat', 'dog']);
  });

  it('rejects duplicate species ids', () => {
    const reg = new SpeciesRegistry();
    reg.register(defineSpecies({ id: 'cat' }));
    expect(() => reg.register(defineSpecies({ id: 'cat' }))).toThrow(InvalidSpeciesError);
  });

  it('require() throws for missing species', () => {
    const reg = new SpeciesRegistry();
    expect(() => reg.require('ghost')).toThrow(/'ghost' is not registered/);
  });

  it('registerAll registers a list', () => {
    const reg = new SpeciesRegistry();
    reg.registerAll([defineSpecies({ id: 'a' }), defineSpecies({ id: 'b' })]);
    expect(reg.list()).toHaveLength(2);
  });
});
