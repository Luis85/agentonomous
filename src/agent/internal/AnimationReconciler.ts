import {
  ANIMATION_TRANSITION,
  type AnimationTransitionEvent,
} from '../../animation/AnimationTransitionEvent.js';
import type { Agent } from '../Agent.js';

/**
 * Stage 2.8 of the tick pipeline: reconcile the animation state machine
 * and emit `AnimationTransition` when it rotates.
 *
 * @internal
 */
export class AnimationReconciler {
  constructor(private readonly agent: Agent) {}

  run(at: number): { from: string; to: string; reason?: string } | null {
    const agent = this.agent;
    const transition = agent.animation.reconcile({
      modifiers: agent.modifiers,
      wallNowMs: at,
      ...(agent.currentActiveSkillId !== undefined
        ? { activeSkillId: agent.currentActiveSkillId }
        : {}),
      ...(agent.currentMood?.category !== undefined ? { mood: agent.currentMood.category } : {}),
    });
    if (!transition) return null;
    const event: AnimationTransitionEvent = {
      type: ANIMATION_TRANSITION,
      at,
      agentId: agent.identity.id,
      from: transition.from,
      to: transition.to,
      ...(transition.reason !== undefined ? { reason: transition.reason } : {}),
      ...(transition.fxHint !== undefined ? { fxHint: transition.fxHint } : {}),
    };
    agent.publishEvent(event);
    return {
      from: transition.from,
      to: transition.to,
      ...(transition.reason !== undefined ? { reason: transition.reason } : {}),
    };
  }
}
