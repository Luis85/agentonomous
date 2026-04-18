import type { Agent } from '../../agent/Agent.js';
import type { ActorLike } from './types.js';

/**
 * One-way binding: each frame, copy the agent's body transform onto the
 * Excalibur actor. Never mutates the agent from the actor side — keeps
 * the agent as the single source of truth.
 *
 * Usage:
 * ```ts
 * import { Actor } from 'excalibur';
 * const actor = new Actor({ x: 0, y: 0, width: 32, height: 32 });
 * const binding = new ExcaliburAgentActor(pet, actor);
 * actor.onPreUpdate = () => binding.sync();
 * ```
 *
 * Tests inject an `ActorLike` stub so nothing pulls Excalibur's
 * `window` polyfill into Node.
 */
export class ExcaliburAgentActor {
  constructor(
    private readonly agent: Agent,
    private readonly actor: ActorLike,
  ) {}

  /**
   * Pull position/rotation/scale from the agent's `Embodiment` (if any)
   * and push them onto the actor. Safe to call on agents without an
   * embodiment — it's a no-op in that case.
   */
  sync(): void {
    const body = this.agent.embodiment;
    if (!body) return;
    this.actor.pos.x = body.transform.position.x;
    this.actor.pos.y = body.transform.position.y;
    // Excalibur uses a single scalar for Z-rotation; the agent carries a
    // 3-vector. We use the Z component as the canonical 2D rotation.
    this.actor.rotation = body.transform.rotation.z;
    this.actor.scale.x = body.transform.scale.x;
    this.actor.scale.y = body.transform.scale.y;
  }
}
