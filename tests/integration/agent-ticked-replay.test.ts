import { describe, expect, it } from 'vitest';
import {
  AGENT_TICKED,
  createAgent,
  defaultPetInteractionModule,
  defineRandomEvent,
  defineSpecies,
  ExpressMeowSkill,
  InMemoryMemoryAdapter,
  ManualClock,
  RandomEventTicker,
  SeededRng,
  SkillRegistry,
  type AgentTickedEvent,
  type DomainEvent,
} from '../../src/index.js';

/**
 * Replay-equivalence proof for the 0.9.1 AgentTicked event.
 *
 * Two agents built with identical seed + clock + species + modules,
 * stepped through the same dt pattern, must produce byte-identical
 * `AgentTicked` sequences (ordering, payloads).
 *
 * Species + helper shape mirror `parallel-agent-determinism.test.ts`
 * so the two suites stay in lock-step.
 */
const AGENT_ID = 'replay-whiskers';

function buildAgent() {
  const clock = new ManualClock(1_700_000_000_000);
  const rng = new SeededRng('agent-ticked-replay');
  const events: DomainEvent[] = [];

  const species = defineSpecies({
    id: 'cat',
    needs: [
      { id: 'hunger', level: 1, decayPerSec: 0.2, criticalThreshold: 0.3 },
      { id: 'cleanliness', level: 1, decayPerSec: 0.15, criticalThreshold: 0.25 },
      { id: 'happiness', level: 0.8, decayPerSec: 0.1, criticalThreshold: 0.25 },
      { id: 'energy', level: 1, decayPerSec: 0.12, criticalThreshold: 0.2 },
      { id: 'health', level: 1, decayPerSec: 0.01, criticalThreshold: 0.2 },
    ],
    lifecycle: {
      schedule: [
        { stage: 'egg', atSeconds: 0 },
        { stage: 'kitten', atSeconds: 3 },
        { stage: 'adult', atSeconds: 12 },
      ],
    },
  });

  const skills = new SkillRegistry();
  skills.registerAll(defaultPetInteractionModule.skills ?? []);
  skills.register(ExpressMeowSkill);

  const randomEvents = new RandomEventTicker([
    defineRandomEvent({
      id: 'surpriseTreat',
      probabilityPerSecond: 0.3,
      cooldownSeconds: 5,
      emit: () => ({ type: 'RandomEvent', subtype: 'surpriseTreat', at: 0 }),
    }),
  ]);

  const agent = createAgent({
    id: AGENT_ID,
    species,
    clock,
    rng,
    memory: new InMemoryMemoryAdapter(),
    modules: [defaultPetInteractionModule],
    skills,
    randomEvents,
  });

  // Structural clone on push — matches parallel-agent-determinism.test.ts:90.
  agent.subscribe((e) => {
    events.push({ ...e });
  });

  return { agent, clock, events };
}

describe('AgentTicked replay equivalence', () => {
  it('produces byte-identical AgentTicked payloads across two seeded runs', async () => {
    const a = buildAgent();
    const b = buildAgent();

    for (let i = 0; i < 20; i++) {
      a.clock.advance(100);
      b.clock.advance(100);
      await a.agent.tick(0.1);
      await b.agent.tick(0.1);
    }

    const aTicked = a.events.filter((e) => e.type === AGENT_TICKED) as AgentTickedEvent[];
    const bTicked = b.events.filter((e) => e.type === AGENT_TICKED) as AgentTickedEvent[];

    expect(aTicked).toHaveLength(20);
    expect(bTicked).toHaveLength(20);
    expect(aTicked).toEqual(bTicked);
  });
});
