import type { AgentRole } from './AgentRole.js';
import type { Persona } from './Persona.js';
import type { Species } from './Species.js';

/**
 * Stable identifying facts about an agent. Embedded in every `DecisionTrace`
 * and serialized into every `AgentSnapshot` so downstream consumers can route
 * events and rebuild state without side channels.
 */
export interface AgentIdentity {
  /** Stable unique identifier; survives across snapshots. */
  id: string;
  /** Human-readable name. May be renamed post-hoc without breaking persistence. */
  name: string;
  /** Schema version of the AGENT itself (not of snapshots). Lets consumers gate features. */
  version: string;
  /** Role in the simulation. Defaults to `'npc'` via `createAgent`. */
  role: AgentRole;
  /** Species identifier; couples to an optional `SpeciesDescriptor` (M12). */
  species: Species;
  /** Optional personality dials read by the reasoner. */
  persona?: Persona;
}
