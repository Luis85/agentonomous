import { describe, expect, it } from 'vitest';
import { Agent, type AgentDependencies } from '../../../src/agent/Agent.js';
import type { AgentIdentity } from '../../../src/agent/AgentIdentity.js';
import { err } from '../../../src/agent/result.js';
import type { Learner, LearningOutcome } from '../../../src/cognition/learning/Learner.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { DirectBehaviorRunner } from '../../../src/cognition/behavior/DirectBehaviorRunner.js';
import { INTERACTION_REQUESTED } from '../../../src/interaction/InteractionRequestedEvent.js';
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
});
