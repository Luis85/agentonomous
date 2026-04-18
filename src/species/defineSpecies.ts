import { InvalidSpeciesError } from '../agent/errors.js';
import type { SpeciesDescriptor } from './SpeciesDescriptor.js';

/**
 * Data-driven factory for `SpeciesDescriptor`. Accepts either a TS object
 * or a JSON-serialized species file. Validates minimal invariants and
 * returns a frozen-ish descriptor so the agent can safely reference it
 * across sessions without worrying about shared mutation.
 */
export function defineSpecies(template: SpeciesDescriptor): SpeciesDescriptor {
  if (!template.id || typeof template.id !== 'string') {
    throw new InvalidSpeciesError('Species descriptor requires a non-empty string `id`.');
  }
  if (template.needs) {
    const seen = new Set<string>();
    for (const need of template.needs) {
      if (seen.has(need.id)) {
        throw new InvalidSpeciesError(
          `Species '${template.id}' declares duplicate need id '${need.id}'.`,
        );
      }
      seen.add(need.id);
    }
  }
  if (template.lifecycle) {
    const stages = new Set<string>();
    for (const entry of template.lifecycle.schedule) {
      if (stages.has(entry.stage)) {
        throw new InvalidSpeciesError(
          `Species '${template.id}' declares duplicate lifecycle stage '${entry.stage}'.`,
        );
      }
      stages.add(entry.stage);
    }
  }
  return { version: 1, ...template };
}
