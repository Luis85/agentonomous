import {
  AGENT_DIED,
  LIFE_STAGE_CHANGED,
  type AgentDiedEvent,
  type LifeStageChangedEvent,
} from '../../events/standardEvents.js';
import {
  ANIMATION_TRANSITION,
  type AnimationTransitionEvent,
} from '../../animation/AnimationTransitionEvent.js';
import { DECEASED_STAGE } from '../../lifecycle/LifeStage.js';
import type { Agent } from '../Agent.js';

/**
 * Internal death path. Marks the agent deceased, flips `halted`, and
 * emits `LifeStageChanged` (if the age model crossed) plus `AgentDied`
 * plus `AnimationTransition` so renderers update immediately.
 *
 * Used by both explicit `agent.kill(reason)` and automatic
 * health-depletion. Idempotent — second call is a no-op once `halted`
 * is set.
 *
 * @internal
 */
export function runDeath(
  agent: Agent,
  cause: 'health-depleted' | 'stage-transition' | 'explicit' | (string & {}),
  reason: string | undefined,
  at: number,
): void {
  if (agent.halted) return;
  agent.halted = true;

  const transition = agent.ageModel?.markDeceased() ?? null;
  if (transition) {
    const stageEvent: LifeStageChangedEvent = {
      type: LIFE_STAGE_CHANGED,
      at,
      agentId: agent.identity.id,
      from: transition.from,
      to: transition.to,
      atAgeSeconds: transition.atAgeSeconds,
    };
    agent.publishEvent(stageEvent);
  }

  const died: AgentDiedEvent = {
    type: AGENT_DIED,
    at,
    agentId: agent.identity.id,
    cause,
    atAgeSeconds: agent.ageModel?.ageSeconds ?? 0,
    ...(reason !== undefined ? { reason } : {}),
  };
  agent.publishEvent(died);

  // Force the animation into its 'dead' state so renderers update
  // immediately; reconciliation is inert from now on since halted=true
  // short-circuits future ticks.
  const animationT = agent.animation.transition('dead', at, DECEASED_STAGE);
  if (animationT) {
    const animEvent: AnimationTransitionEvent = {
      type: ANIMATION_TRANSITION,
      at,
      agentId: agent.identity.id,
      from: animationT.from,
      to: animationT.to,
      reason: DECEASED_STAGE,
    };
    agent.publishEvent(animEvent);
  }
}
