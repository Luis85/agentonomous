import type { IntentionCandidate } from '../cognition/IntentionCandidate.js';
import type { Persona } from '../agent/Persona.js';
import type { Needs } from './Needs.js';

/**
 * Strategy that turns low needs into intention candidates. Two flavors ship
 * by default:
 *
 * - `ExpressiveNeedsPolicy` — emits `kind: 'express'` intentions (meow, look
 *   sad). Used by the MVP nurture-pet: the pet reacts emotionally; the
 *   player satisfies needs via interactions.
 * - `ActiveNeedsPolicy` — emits `kind: 'satisfy'` intentions (eat food, go
 *   drink). Used by self-directed sim agents (gatherers, NPCs).
 *
 * Compose them via `ComposedNeedsPolicy` when an agent should both express
 * and self-satisfy.
 */
export interface NeedsPolicy {
  suggest(needs: Needs, persona?: Persona): readonly IntentionCandidate[];
}
