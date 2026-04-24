import { LIFE_STAGE_CHANGED, type LifeStageChangedEvent } from '../../events/standardEvents.js';
import type { LifeStageTransition } from '../../lifecycle/AgeModel.js';
import type { Agent } from '../Agent.js';

/**
 * Stage 0 of the tick pipeline: advance the age model and emit
 * `LifeStageChanged` for each threshold crossed.
 *
 * @internal
 */
export class LifecycleTicker {
  constructor(private readonly agent: Agent) {}

  run(virtualDtSeconds: number, at: number): readonly LifeStageTransition[] {
    const { ageModel } = this.agent;
    if (!ageModel) return [];
    const transitions = ageModel.advance(virtualDtSeconds);
    for (const t of transitions) {
      const event: LifeStageChangedEvent = {
        type: LIFE_STAGE_CHANGED,
        at,
        agentId: this.agent.identity.id,
        from: t.from,
        to: t.to,
        atAgeSeconds: t.atAgeSeconds,
      };
      this.agent.publishEvent(event);
    }
    return transitions;
  }
}
