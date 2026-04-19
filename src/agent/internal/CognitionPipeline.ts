import type { DomainEvent } from '../../events/DomainEvent.js';
import {
  SKILL_COMPLETED,
  SKILL_FAILED,
  type SkillCompletedEvent,
  type SkillFailedEvent,
} from '../../events/standardEvents.js';
import type { IntentionCandidate } from '../../cognition/IntentionCandidate.js';
import { stageAllowsSkill } from '../../lifecycle/StageCapabilities.js';
import type { SkillContext } from '../../skills/SkillContext.js';
import type { SkillError, SkillOutcome } from '../../skills/Skill.js';
import type { Result } from '../result.js';
import { isInvokeSkillAction, type AgentAction } from '../AgentAction.js';
import type { Agent } from '../Agent.js';

/**
 * Stages 3–7 of the tick pipeline: collect actions (control-mode-dispatched),
 * run autonomous cognition, execute resulting actions through the skill
 * registry, and build the `SkillContext` passed to each skill invocation.
 *
 * @internal
 */
export class CognitionPipeline {
  constructor(private readonly agent: Agent) {}

  /** Collect actions for this tick based on the agent's current `controlMode`. */
  async collectActions(
    wallNowMs: number,
    perceived: readonly DomainEvent[],
  ): Promise<AgentAction[]> {
    const agent = this.agent;
    switch (agent.controlMode) {
      case 'remote': {
        if (!agent.remote) return [];
        const pulled = await agent.remote.pull(agent.identity.id, wallNowMs);
        return [...pulled];
      }
      case 'scripted': {
        if (!agent.scripted) return [];
        const next = agent.scripted.next(agent.identity.id, wallNowMs);
        return next ? [...next] : [];
      }
      case 'autonomous':
      default:
        return this.runAutonomousCognition(perceived);
    }
  }

  /** Autonomous cognition — Stage 4 (candidates) + 5 (select) + 6 (behavior). */
  runAutonomousCognition(perceived: readonly DomainEvent[]): AgentAction[] {
    const agent = this.agent;
    const candidates: IntentionCandidate[] = [];
    if (agent.needs && agent.needsPolicy) {
      for (const c of agent.needsPolicy.suggest(agent.needs, agent.identity.persona)) {
        candidates.push(c);
      }
    }
    const intention = agent.reasoner.selectIntention({
      perceived,
      needs: agent.needs,
      modifiers: agent.modifiers,
      ...(agent.identity.persona !== undefined ? { persona: agent.identity.persona } : {}),
      candidates,
    });
    if (!intention) return [];
    return [...agent.behavior.run(intention)];
  }

  /** Stage 7: dispatch actions — invoke-skill goes through the registry. */
  async executeActions(actions: readonly AgentAction[], wallNowMs: number): Promise<void> {
    if (actions.length === 0) return;
    const ctx = this.skillContext();
    for (const action of actions) {
      if (action.type === 'noop') continue;
      if (isInvokeSkillAction(action)) {
        await this.invokeSkillAction(action.skillId, action.params, ctx, wallNowMs);
        continue;
      }
      if (action.type === 'emit-event' && 'event' in action) {
        const event = (action as { event: DomainEvent }).event;
        this.agent._internalPublish(event);
        continue;
      }
      // Unknown action kinds are left for consumer modules to interpret;
      // they can subscribe and react via reactive handlers next tick.
    }
  }

  /**
   * Invoke a skill through the registry, honoring stage capabilities +
   * modifier effectiveness, and emit the appropriate SkillCompleted /
   * SkillFailed event.
   */
  async invokeSkillAction(
    skillId: string,
    params: Record<string, unknown> | undefined,
    ctx: SkillContext,
    wallNowMs: number,
  ): Promise<void> {
    const agent = this.agent;
    // Stage capability gate.
    if (agent.ageModel && agent.stageCapabilities) {
      if (!stageAllowsSkill(agent.stageCapabilities, agent.ageModel.stage, skillId)) {
        const event: SkillFailedEvent = {
          type: SKILL_FAILED,
          at: wallNowMs,
          agentId: agent.identity.id,
          skillId,
          code: 'stage-blocked',
          message: `Skill '${skillId}' is blocked at stage '${agent.ageModel.stage}'.`,
        };
        agent._internalPublish(event);
        return;
      }
    }
    if (!agent.skills.has(skillId)) {
      const event: SkillFailedEvent = {
        type: SKILL_FAILED,
        at: wallNowMs,
        agentId: agent.identity.id,
        skillId,
        code: 'not-registered',
        message: `No skill registered with id '${skillId}'.`,
      };
      agent._internalPublish(event);
      return;
    }
    // Expose the running skill to the animation reconciler. Scoped to this
    // invocation so multiple sequential skills don't leak state.
    const previousActive = agent.currentActiveSkillId;
    agent.currentActiveSkillId = skillId;
    const result: Result<SkillOutcome, SkillError> = await agent.skills
      .invoke(skillId, params, ctx)
      .finally(() => {
        agent.currentActiveSkillId = previousActive;
      });
    if (result.ok) {
      const skill = agent.skills.get(skillId);
      const base = skill?.baseEffectiveness ?? 1;
      const effectiveness =
        (result.value.effectiveness ?? base) * agent.modifiers.skillEffectiveness(skillId);
      const event: SkillCompletedEvent = {
        type: SKILL_COMPLETED,
        at: wallNowMs,
        agentId: agent.identity.id,
        skillId,
        effectiveness,
        ...(result.value.fxHint !== undefined ? { fxHint: result.value.fxHint } : {}),
        ...(result.value.details !== undefined ? { details: result.value.details } : {}),
      };
      agent._internalPublish(event);
      agent.learner.score({
        intention: { kind: 'satisfy', type: skillId },
        actions: [{ type: 'invoke-skill', skillId, ...(params !== undefined ? { params } : {}) }],
        details: { effectiveness },
      });
    } else {
      const event: SkillFailedEvent = {
        type: SKILL_FAILED,
        at: wallNowMs,
        agentId: agent.identity.id,
        skillId,
        code: result.error.code,
        message: result.error.message,
        ...(result.error.details !== undefined ? { details: result.error.details } : {}),
      };
      agent._internalPublish(event);
    }
  }

  /** Build the SkillContext passed to every skill execution. */
  skillContext(): SkillContext {
    const agent = this.agent;
    return {
      identity: agent.identity,
      clock: agent.clock,
      rng: agent.rng,
      satisfyNeed: (needId, amount) => {
        agent.needs?.satisfy(needId, amount);
      },
      applyModifier: (mod) => agent.applyModifier(mod),
      removeModifier: (id) => agent.removeModifier(id),
      publishEvent: (event) => {
        agent._internalPublish(event);
      },
      ageSeconds: () => agent.ageModel?.ageSeconds ?? 0,
    };
  }
}
