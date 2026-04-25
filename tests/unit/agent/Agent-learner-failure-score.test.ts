import { describe, expect, it } from 'vitest';
import { Agent, type AgentDependencies } from '../../../src/agent/Agent.js';
import type { AgentIdentity } from '../../../src/agent/AgentIdentity.js';
import { err, ok } from '../../../src/agent/result.js';
import type { Learner, LearningOutcome } from '../../../src/cognition/learning/Learner.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { DirectBehaviorRunner } from '../../../src/cognition/behavior/DirectBehaviorRunner.js';
import { INTERACTION_REQUESTED } from '../../../src/interaction/InteractionRequestedEvent.js';
import { Needs } from '../../../src/needs/Needs.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';
import { SeededRng } from '../../../src/ports/SeededRng.js';
import type { Skill } from '../../../src/skills/Skill.js';
import { SkillRegistry } from '../../../src/skills/SkillRegistry.js';

function recordingLearner(): Learner & { calls: LearningOutcome[] } {
  const calls: LearningOutcome[] = [];
  return {
    calls,
    score(outcome) {
      calls.push(outcome);
    },
  };
}

function baseDeps(overrides: Partial<AgentDependencies> = {}): AgentDependencies {
  const identity: AgentIdentity = {
    id: 'whiskers',
    name: 'Whiskers',
    version: '0.0.0',
    role: 'npc',
    species: 'cat',
  };
  return {
    identity,
    eventBus: new InMemoryEventBus(),
    clock: new ManualClock(1_000),
    rng: new SeededRng('learner-failure-seed'),
    ...overrides,
  };
}

function agentWithSkill(
  skill: Skill,
  learner: Learner,
  extra: Partial<AgentDependencies> = {},
): Agent {
  const registry = new SkillRegistry();
  registry.register(skill);
  return new Agent(
    baseDeps({
      skills: registry,
      behavior: new DirectBehaviorRunner(),
      learner,
      modules: [
        {
          id: 'interaction-router',
          reactiveHandlers: [
            {
              on: INTERACTION_REQUESTED,
              handle: async (event, facade) => {
                const verb = (event as { verb?: string }).verb;
                if (verb === skill.id) {
                  await facade.invokeSkill(skill.id, undefined);
                }
              },
            },
          ],
        },
      ],
      ...extra,
    }),
  );
}

describe('Stage 8 (score) on SkillFailed branches', () => {
  it('scores an outcome when a skill returns err(...)', async () => {
    const failing: Skill = {
      id: 'flop',
      label: 'Flop',
      baseEffectiveness: 1,
      execute() {
        return Promise.resolve(err({ code: 'forced-fail', message: 'nope' }));
      },
    };
    const learner = recordingLearner();
    const agent = agentWithSkill(failing, learner);
    agent.interact('flop');
    await agent.tick(0.016);

    expect(learner.calls).toHaveLength(1);
    expect(learner.calls[0]).toMatchObject({
      intention: { kind: 'satisfy', type: 'flop' },
      details: { failed: true, code: 'forced-fail' },
    });
  });

  it('scores an outcome when a skill throws', async () => {
    const thrower: Skill = {
      id: 'boom',
      label: 'Boom',
      baseEffectiveness: 1,
      execute() {
        throw new Error('kaboom');
      },
    };
    const learner = recordingLearner();
    const agent = agentWithSkill(thrower, learner);
    agent.interact('boom');
    await agent.tick(0.016);

    expect(learner.calls).toHaveLength(1);
    expect(learner.calls[0]).toMatchObject({
      intention: { kind: 'satisfy', type: 'boom' },
      details: { failed: true, code: 'execution-threw' },
    });
  });

  it('scores an outcome when no skill is registered for the requested id', async () => {
    // Build with an empty registry, but route the interact verb to the
    // missing skill anyway via a custom reactive handler.
    const learner = recordingLearner();
    const agent = new Agent(
      baseDeps({
        skills: new SkillRegistry(),
        behavior: new DirectBehaviorRunner(),
        learner,
        modules: [
          {
            id: 'interaction-router',
            reactiveHandlers: [
              {
                on: INTERACTION_REQUESTED,
                handle: async (_event, facade) => {
                  await facade.invokeSkill('ghost', undefined);
                },
              },
            ],
          },
        ],
      }),
    );
    agent.interact('ghost');
    await agent.tick(0.016);

    expect(learner.calls).toHaveLength(1);
    expect(learner.calls[0]).toMatchObject({
      intention: { kind: 'satisfy', type: 'ghost' },
      details: { failed: true, code: 'not-registered' },
    });
  });

  it('captures pre-skill needs in outcome.details.preNeeds for the success branch', async () => {
    // The skill mutates a need via the context (`satisfyNeed`). The score
    // call MUST carry the level BEFORE the mutation, otherwise consumers
    // would train on (post-effect state → action), inverting the policy.
    const feeder: Skill = {
      id: 'feeder',
      label: 'Feeder',
      baseEffectiveness: 1,
      execute(_params, ctx) {
        ctx.satisfyNeed('hunger', 0.5);
        return Promise.resolve(ok({ effectiveness: 1 }));
      },
    };
    const learner = recordingLearner();
    const needs = new Needs([{ id: 'hunger', level: 0.2, decayPerSec: 0, criticalThreshold: 0.1 }]);
    const agent = agentWithSkill(feeder, learner, { needs });
    agent.interact('feeder');
    await agent.tick(0.016);

    expect(learner.calls).toHaveLength(1);
    const details = learner.calls[0]?.details as { preNeeds?: Record<string, number> };
    expect(details.preNeeds).toBeDefined();
    // Pre-skill hunger ≈ 0.2 (initial level); post-skill would be 0.7.
    // Tolerate tiny float drift; the key claim is "pre, not post".
    expect(details.preNeeds!.hunger).toBeCloseTo(0.2, 5);
  });

  it('omits preNeeds when the agent has no Needs subsystem', async () => {
    const failing: Skill = {
      id: 'flop',
      label: 'Flop',
      baseEffectiveness: 1,
      execute() {
        return Promise.resolve(err({ code: 'forced-fail', message: 'nope' }));
      },
    };
    const learner = recordingLearner();
    const agent = agentWithSkill(failing, learner);
    agent.interact('flop');
    await agent.tick(0.016);

    expect(learner.calls).toHaveLength(1);
    const details = learner.calls[0]?.details as { preNeeds?: unknown };
    expect(details.preNeeds).toBeUndefined();
  });
});
