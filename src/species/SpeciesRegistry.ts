import { InvalidSpeciesError } from '../agent/errors.js';
import type { SpeciesDescriptor } from './SpeciesDescriptor.js';

/**
 * Lookup registry for consumer-defined species descriptors. Consumers
 * pre-register their species so `createAgent({ species: 'cat' })` can
 * resolve the full descriptor behind the string.
 *
 * The registry is deliberately local (no global singleton) — consumers
 * typically construct one per application, share it among multiple agents,
 * and pass it to `createAgent({ speciesRegistry, species: 'cat' })`.
 */
export class SpeciesRegistry {
  private readonly byId = new Map<string, SpeciesDescriptor>();

  register(descriptor: SpeciesDescriptor): void {
    if (this.byId.has(descriptor.id)) {
      throw new InvalidSpeciesError(`Species '${descriptor.id}' is already registered.`);
    }
    this.byId.set(descriptor.id, descriptor);
  }

  registerAll(descriptors: readonly SpeciesDescriptor[]): void {
    for (const d of descriptors) this.register(d);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): SpeciesDescriptor | undefined {
    return this.byId.get(id);
  }

  require(id: string): SpeciesDescriptor {
    const found = this.byId.get(id);
    if (!found) {
      throw new InvalidSpeciesError(`Species '${id}' is not registered.`);
    }
    return found;
  }

  list(): readonly SpeciesDescriptor[] {
    return [...this.byId.values()];
  }
}
