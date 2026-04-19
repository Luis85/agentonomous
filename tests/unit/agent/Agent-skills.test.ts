import { describe, expect, it } from 'vitest';
import { Agent, type AgentDependencies } from '../../../src/agent/Agent.js';
import type { AgentIdentity } from '../../../src/agent/AgentIdentity.js';
import { err, ok } from '../../../src/agent/result.js';
import type { DomainEvent } from '../../../src/events/DomainEvent.js';
import { InMemoryEventBus } from '../../../src/events/InMemoryEventBus.js';
import { SKILL_FAILED } from '../../../src/events/standardEvents.js';
import { DirectBehaviorRunner } from '../../../src/cognition/behavior/DirectBehaviorRunner.js';
import { INTERACTION_REQUESTED } from '../../../src/interaction/InteractionRequestedEvent.js';
import { ManualClock } from '../../../src/ports/ManualClock.js';
import { SeededRng } from '../../../src/ports/SeededRng.js';
import type { Skill } from '../../../src/skills/Skill.js';
import { SkillRegistry } from '../../../src/skills/SkillRegistry.js';

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
    rng: new SeededRng('skill-test-seed'),
    ...overrides,
  };
}

/**
 * Wire an agent so `agent.interact(verb)` → a reactive handler → an
 * `invoke-skill` action that hits `skillId`. Mirrors how consumers typically
 * route UI verbs to skills without going through the default pet-interaction
 * module.
 */
function agentWithSkill(skill: Skill, extra: Partial<AgentDependencies> = {}): Agent {
  const registry = new SkillRegistry();
  registry.register(skill);
  const agent = new Agent(
    baseDeps({
      skills: registry,
      behavior: new DirectBehaviorRunner(),
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
  return agent;
}

describe('Agent skill-invocation error handling — R-03', () => {
  it('sync-throwing skill emits SkillFailed with code "execution-threw"', async () => {
    const thrower: Skill = {
      id: 'boom',
      label: 'Boom',
      baseEffectiveness: 1,
      execute() {
        throw new Error('kaboom');
      },
    };
    const agent = agentWithSkill(thrower);
    const seen: DomainEvent[] = [];
    agent.subscribe((e) => seen.push(e));

    agent.interact('boom');
    // First tick: perceive + reactive handler fires the skill (which throws).
    await agent.tick(0.016);

    const failures = seen.filter((e) => e.type === SKILL_FAILED);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      skillId: 'boom',
      code: 'execution-threw',
      message: 'kaboom',
    });
  });

  it('async-throwing skill emits SkillFailed with code "execution-threw"', async () => {
    const asyncThrower: Skill = {
      id: 'boom-async',
      label: 'Boom Async',
      baseEffectiveness: 1,
      execute() {
        return Promise.reject(new Error('async kaboom'));
      },
    };
    const agent = agentWithSkill(asyncThrower);
    const seen: DomainEvent[] = [];
    agent.subscribe((e) => seen.push(e));

    agent.interact('boom-async');
    await agent.tick(0.016);

    const failures = seen.filter((e) => e.type === SKILL_FAILED);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      skillId: 'boom-async',
      code: 'execution-threw',
      message: 'async kaboom',
    });
  });

  it('RNG state after a throwing skill matches RNG state after an equivalent err-returning skill', async () => {
    // Both skills should produce identical side effects on the agent's RNG:
    // namely, zero. A throw must not stealth-draw.
    const throwing: Skill = {
      id: 'fail',
      label: 'Fail',
      baseEffectiveness: 1,
      execute() {
        throw new Error('boom');
      },
    };
    const returning: Skill = {
      id: 'fail',
      label: 'Fail',
      baseEffectiveness: 1,
      execute() {
        return Promise.resolve(err({ code: 'forced-fail', message: 'boom' }));
      },
    };

    async function runWith(skill: Skill): Promise<number[]> {
      const agent = agentWithSkill(skill, { rng: new SeededRng('determinism-probe') });
      agent.interact('fail');
      await agent.tick(0.016);
      return Array.from({ length: 4 }, () => agent.rng.next());
    }

    const rngThrow = await runWith(throwing);
    const rngReturn = await runWith(returning);
    expect(rngThrow).toEqual(rngReturn);
  });

  it('subsequent ticks proceed normally after a throwing skill', async () => {
    const toggling = {
      shouldThrow: true,
    };
    const skill: Skill = {
      id: 'flaky',
      label: 'Flaky',
      baseEffectiveness: 1,
      execute() {
        if (toggling.shouldThrow) {
          toggling.shouldThrow = false;
          throw new Error('first call explodes');
        }
        return Promise.resolve(ok({ effectiveness: 1 }));
      },
    };
    const agent = agentWithSkill(skill);
    const seen: DomainEvent[] = [];
    agent.subscribe((e) => seen.push(e));

    agent.interact('flaky');
    await agent.tick(0.016);
    agent.interact('flaky');
    const trace = await agent.tick(0.016);

    // The second invocation succeeds — the agent is not wedged by the throw.
    expect(trace.halted).toBe(false);
    expect(seen.filter((e) => e.type === SKILL_FAILED)).toHaveLength(1);
    // And SkillCompleted fires exactly once, for the second call.
    const completed = seen.filter((e) => e.type === 'SkillCompleted');
    expect(completed).toHaveLength(1);
  });
});
