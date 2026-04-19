import { MOOD_CHANGED, type MoodChangedEvent } from '../../events/standardEvents.js';
import type { Agent } from '../Agent.js';

/**
 * Stage 2.7 of the tick pipeline: evaluate the mood model and emit
 * `MoodChanged` when the category rotates.
 *
 * @internal
 */
export class MoodReconciler {
  constructor(private readonly agent: Agent) {}

  run(at: number): { from: string | undefined; to: string; valence: number | undefined } | null {
    const agent = this.agent;
    if (!agent.moodModel) return null;
    const previous = agent.currentMood;
    const next = agent.moodModel.evaluate({
      needs: agent.needs,
      modifiers: agent.modifiers,
      persona: agent.identity.persona,
      wallNowMs: at,
      previous,
    });
    agent.currentMood = next;
    if (previous && previous.category === next.category) return null;
    const event: MoodChangedEvent = {
      type: MOOD_CHANGED,
      at,
      agentId: agent.identity.id,
      from: previous?.category,
      to: next.category,
      valence: next.valence,
    };
    agent._internalPublish(event);
    return { from: previous?.category, to: next.category, valence: next.valence };
  }
}
