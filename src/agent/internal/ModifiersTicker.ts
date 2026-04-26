import { MODIFIER_EXPIRED, type ModifierExpiredEvent } from '../../events/standardEvents.js';
import type { ModifierRemoval } from '../../modifiers/Modifiers.js';
import type { Agent } from '../Agent.js';

/**
 * Stage 2 of the tick pipeline: expire time-bound modifiers and publish
 * `ModifierExpired` events.
 *
 * @internal
 */
export class ModifiersTicker {
  constructor(private readonly agent: Agent) {}

  run(at: number): readonly ModifierRemoval[] {
    const expired = this.agent.modifiers.tick(at);
    for (const removal of expired) {
      const event: ModifierExpiredEvent = {
        type: MODIFIER_EXPIRED,
        at,
        agentId: this.agent.identity.id,
        modifierId: removal.modifier.id,
        source: removal.modifier.source,
        ...(removal.modifier.visual?.fxHint !== undefined
          ? { fxHint: removal.modifier.visual.fxHint }
          : {}),
      };
      this.agent.publishEvent(event);
    }
    return expired;
  }
}
