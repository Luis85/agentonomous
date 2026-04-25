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
 * Result of `collectActions` — the action list plus the candidate
 * intentions the reasoner considered this tick. `candidates` is empty for
 * non-autonomous control modes.
 *
 * @internal
 */
export type CollectActionsResult = {
  actions: AgentAction[];
  candidates: readonly IntentionCandidate[];
};

/**
 * Stages 3–7 of the tick pipeline: collect actions (control-mode-dispatched),
 * run autonomous cognition, execute resulting actions through the skill
 * registry, and build the `SkillContext` passed to each skill invocation.
 *
 * @internal
 */
export class CognitionPipeline {
  constructor(private readonly agent: Agent) {}

  /**
   * Collect actions for this tick based on the agent's current `controlMode`,
   * returning both the resolved action list and — for autonomous cognition —
   * the candidate intentions considered. Remote and scripted modes report
   * an empty candidate list (they bypass the reasoner entirely).
   */
  async collectActions(
    wallNowMs: number,
    perceived: readonly DomainEvent[],
  ): Promise<CollectActionsResult> {
    const agent = this.agent;
    switch (agent.controlMode) {
      case 'remote': {
        if (!agent.remote) return { actions: [], candidates: [] };
        const pulled = await agent.remote.pull(agent.identity.id, wallNowMs);
        return { actions: [...pulled], candidates: [] };
      }
      case 'scripted': {
        if (!agent.scripted) return { actions: [], candidates: [] };
        const next = agent.scripted.next(agent.identity.id, wallNowMs);
        return { actions: next ? [...next] : [], candidates: [] };
      }
      case 'autonomous':
      default:
        return this.runAutonomousCognition(perceived);
    }
  }

  /** Autonomous cognition — Stage 4 (candidates) + 5 (select) + 6 (behavior). */
  runAutonomousCognition(perceived: readonly DomainEvent[]): CollectActionsResult {
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
    if (!intention) return { actions: [], candidates };
    return { actions: [...agent.behavior.run(intention)], candidates };
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
        this.agent.publishEvent(event);
        continue;
      }
      // Unknown action kinds are left for consumer modules to interpret;
      // they can subscribe and react via reactive handlers next tick.
    }
  }

  /**
   * Invoke a skill through the registry, honoring stage capabilities +
   * modifier effectiveness, and emit the appropriate SkillCompleted /
   * SkillFailed event. Every terminal branch (success or failure) hands
   * a `LearningOutcome` to `agent.learner.score(...)` so consumers can
   * train on both positive and negative evidence.
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
        agent.publishEvent(event);
        this.scoreFailure(skillId, params, 'stage-blocked', event.message);
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
      agent.publishEvent(event);
      this.scoreFailure(skillId, params, 'not-registered', event.message);
      return;
    }
    // Expose the running skill to the animation reconciler. Scoped to this
    // invocation so multiple sequential skills don't leak state.
    const previousActive = agent.currentActiveSkillId;
    agent.currentActiveSkillId = skillId;
    let result: Result<SkillOutcome, SkillError>;
    try {
      result = await agent.skills.invoke(skillId, params, ctx);
    } catch (cause) {
      // Throws from inside a skill are treated as infrastructure failures:
      // emit SkillFailed with `code: 'execution-threw'` and continue. Skills
      // should return `err(...)` for expected failure modes — this path
      // guards determinism: no RNG draws happen between the throw and the
      // next tick, so replay stays byte-identical.
      agent.currentActiveSkillId = previousActive;
      const message = cause instanceof Error ? cause.message : String(cause);
      const event: SkillFailedEvent = {
        type: SKILL_FAILED,
        at: wallNowMs,
        agentId: agent.identity.id,
        skillId,
        code: 'execution-threw',
        message,
        details: { cause: message },
      };
      agent.publishEvent(event);
      this.scoreFailure(skillId, params, 'execution-threw', message);
      return;
    }
    agent.currentActiveSkillId = previousActive;
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
      agent.publishEvent(event);
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
      agent.publishEvent(event);
      this.scoreFailure(skillId, params, result.error.code, result.error.message);
    }
  }

  /**
   * Common Stage-8 hook for every SkillFailed branch. Mirrors the
   * success-side `score` call shape so consumers can switch on
   * `details.failed` to label the outcome (negative reward, one-hot
   * `[0]`, or skip entirely depending on policy).
   */
  private scoreFailure(
    skillId: string,
    params: Record<string, unknown> | undefined,
    code: string,
    message: string,
  ): void {
    this.agent.learner.score({
      intention: { kind: 'satisfy', type: skillId },
      actions: [{ type: 'invoke-skill', skillId, ...(params !== undefined ? { params } : {}) }],
      details: { failed: true, code, message },
    });
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
      hasModifier: (id) => agent.modifiers.has(id),
      publishEvent: (event) => {
        agent.publishEvent(event);
      },
      ageSeconds: () => agent.ageModel?.ageSeconds ?? 0,
    };
  }
}
