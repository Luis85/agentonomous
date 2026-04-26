import {
  NEED_CRITICAL,
  NEED_SAFE,
  type NeedCriticalEvent,
  type NeedSafeEvent,
} from '../../events/standardEvents.js';
import type { NeedsDelta } from '../../needs/Need.js';
import type { Agent } from '../Agent.js';

/**
 * Stage 2.5 of the tick pipeline: decay needs (scaled by modifier
 * multipliers), publish critical/safe crossings, and route the
 * "health depleted → kill" path.
 *
 * @internal
 */
export class NeedsTicker {
  constructor(private readonly agent: Agent) {}

  run(virtualDtSeconds: number, at: number): readonly NeedsDelta[] {
    const agent = this.agent;
    if (!agent.needs || virtualDtSeconds <= 0) return [];
    const deltas = agent.needs.tick(virtualDtSeconds, (id) => agent.modifiers.decayMultiplier(id));
    let healthDepleted = false;
    for (const delta of deltas) {
      if (delta.crossedCritical) {
        const event: NeedCriticalEvent = {
          type: NEED_CRITICAL,
          at,
          agentId: agent.identity.id,
          needId: delta.needId,
          level: delta.after,
        };
        agent.publishEvent(event);
      } else if (delta.crossedSafe) {
        const event: NeedSafeEvent = {
          type: NEED_SAFE,
          at,
          agentId: agent.identity.id,
          needId: delta.needId,
          level: delta.after,
        };
        agent.publishEvent(event);
      }
      if (delta.needId === 'health' && delta.after <= 0) {
        healthDepleted = true;
      }
    }
    if (healthDepleted && !agent.halted) {
      agent.routeDeath('health-depleted', undefined, at);
    }
    return deltas;
  }
}
