import { describe, expect, it } from 'vitest';
import {
  createAgent,
  defaultPetInteractionModule,
  defineModifier,
  defineRandomEvent,
  defineSpecies,
  err,
  ExpressMeowSkill,
  InMemoryMemoryAdapter,
  ManualClock,
  NEED_CRITICAL,
  RandomEventTicker,
  SeededRng,
  SKILL_FAILED,
  SkillRegistry,
  type Agent,
  type AgentModule,
  type DecisionTrace,
  type DomainEvent,
  type Skill,
} from '../../src/index.js';

/**
 * Reproducible nurture-pet simulation. Feeds a scripted interaction
 * sequence into a seeded agent and asserts the event stream, final
 * snapshot, and trace sequence are byte-identical across runs.
 */
function buildPet(): { agent: Agent; clock: ManualClock; events: DomainEvent[] } {
  const clock = new ManualClock(1_700_000_000_000);
  const rng = new SeededRng('whiskers-fixture');
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
        { stage: 'elder', atSeconds: 40 },
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
    id: 'whiskers',
    species,
    clock,
    rng,
    timeScale: 1,
    memory: new InMemoryMemoryAdapter(),
    modules: [defaultPetInteractionModule],
    skills,
    randomEvents,
    persistence: false,
  });

  agent.subscribe((e) => {
    events.push({ ...e });
  });

  return { agent, clock, events };
}

interface ReplayResult {
  traces: DecisionTrace[];
  events: DomainEvent[];
  finalState: ReturnType<Agent['getState']>;
}

async function runScriptedReplay(): Promise<ReplayResult> {
  const { agent, clock, events } = buildPet();
  const traces: DecisionTrace[] = [];

  const advance = async (seconds: number): Promise<void> => {
    clock.advance(seconds * 1000);
    traces.push(await agent.tick(seconds));
  };

  // 1. Run for 2 virtual seconds (kitten not yet).
  await advance(2);

  // 2. Feed at t=2.
  agent.interact('feed');
  await advance(0.1);

  // 3. Skip 4 seconds (kitten hits at ~3).
  await advance(4);

  // 4. Play + clean + pet in rapid succession.
  agent.interact('play');
  await advance(0.05);
  agent.interact('clean');
  await advance(0.05);
  agent.interact('pet');
  await advance(0.05);

  // 5. Drain hunger over 10 virtual seconds.
  await advance(10);

  // 6. Feed twice more.
  agent.interact('feed');
  await advance(0.1);
  agent.interact('feed');
  await advance(0.1);

  // 7. Final long fast-forward (drives the pet to elder).
  await advance(40);

  return { traces, events, finalState: agent.getState() };
}

describe('nurture-pet deterministic replay', () => {
  it('produces byte-identical traces + events + final snapshot across two runs', async () => {
    const runA = await runScriptedReplay();
    const runB = await runScriptedReplay();

    expect(runA.traces).toEqual(runB.traces);
    expect(runA.events).toEqual(runB.events);
    expect(runA.finalState).toEqual(runB.finalState);
  });

  it('pet transitions through lifecycle stages', async () => {
    const { traces } = await runScriptedReplay();
    const stages = new Set(traces.map((t) => t.stage));
    expect(stages.has('kitten') || stages.has('adult') || stages.has('elder')).toBe(true);
  });

  it('feed interaction reduces hunger urgency and emits SkillCompleted', async () => {
    const { agent, clock, events } = buildPet();

    // Starve a bit so feeding is observable.
    clock.advance(3_000);
    await agent.tick(3);
    const hungerBefore = agent.needs?.get('hunger')?.level ?? 0;
    expect(hungerBefore).toBeLessThan(1);

    agent.interact('feed');
    clock.advance(100);
    await agent.tick(0.1);

    const hungerAfter = agent.needs?.get('hunger')?.level ?? 0;
    expect(hungerAfter).toBeGreaterThan(hungerBefore);

    const feedCompleted = events.filter(
      (e) => e.type === 'SkillCompleted' && (e as { skillId?: string }).skillId === 'feed',
    );
    expect(feedCompleted.length).toBeGreaterThanOrEqual(1);
  });

  it('snapshot + restore preserves state across a fresh agent', async () => {
    const { agent: first, clock: firstClock } = buildPet();
    firstClock.advance(5_000);
    await first.tick(5);
    first.interact('feed');
    firstClock.advance(100);
    await first.tick(0.1);
    const snap = first.snapshot();

    const { agent: second } = buildPet();
    await second.restore(snap);

    expect(second.getState().ageSeconds).toBeCloseTo(first.getState().ageSeconds);
    expect(second.getState().needs).toEqual(first.getState().needs);
    expect(second.getState().stage).toBe(first.getState().stage);
  });

  // ---------------------------------------------------------------------
  // R-02 — deepen the determinism claim: reactive handlers, skill failures,
  // and long replays. Every it-block runs the same scripted scenario twice
  // with a fixed seed and asserts byte-identical outputs.
  // ---------------------------------------------------------------------

  it('reactive handler applying a modifier on NeedCritical — 100 s byte-identical', async () => {
    const panicBuff = defineModifier({
      id: 'panic',
      source: 'reactive:need-critical',
      stack: 'refresh',
      durationSeconds: 5,
      effects: [{ target: { type: 'mood-bias', category: 'sad' }, kind: 'add', value: 0.3 }],
    });

    function buildWithReactive(): {
      agent: Agent;
      clock: ManualClock;
      events: DomainEvent[];
      traces: DecisionTrace[];
    } {
      const { agent, clock, events } = buildPet();
      const reactive: AgentModule = {
        id: 'panic-on-critical',
        reactiveHandlers: [
          {
            on: NEED_CRITICAL,
            handle: (_event, facade) => {
              facade.publishEvent({
                type: 'ApplyingPanic',
                at: facade.clock.now(),
                agentId: facade.identity.id,
              });
              // Apply via facade → deterministic, no RNG draw.
              agent.applyModifier(panicBuff.instantiate(facade.clock.now()));
            },
          },
        ],
      };
      agent.installModule(reactive);
      return { agent, clock, events, traces: [] };
    }

    async function run(): Promise<{ traces: DecisionTrace[]; events: DomainEvent[] }> {
      const { agent, clock, traces, events } = buildWithReactive();
      for (let i = 0; i < 100; i++) {
        clock.advance(1_000);
        traces.push(await agent.tick(1));
      }
      return { traces, events };
    }

    const runA = await run();
    const runB = await run();
    expect(runA.traces).toEqual(runB.traces);
    expect(runA.events).toEqual(runB.events);
  });

  it('skill always returning err() produces identical SkillFailed ordering and RNG draws', async () => {
    const forcedFail: Skill = {
      id: 'forced',
      label: 'Forced',
      baseEffectiveness: 1,
      execute() {
        return Promise.resolve(err({ code: 'forced-fail', message: 'nope' }));
      },
    };

    async function runOnce(): Promise<{ failures: DomainEvent[]; rngDraws: number[] }> {
      const clock = new ManualClock(1_700_000_000_000);
      const rng = new SeededRng('forced-fail-fixture');
      const skills = new SkillRegistry();
      skills.register(forcedFail);
      const router: AgentModule = {
        id: 'force-router',
        reactiveHandlers: [
          {
            on: 'InteractionRequested',
            handle: async (event, facade) => {
              if ((event as { verb?: string }).verb === 'forced') {
                await facade.invokeSkill('forced', undefined);
              }
            },
          },
        ],
      };
      const agent = createAgent({
        id: 'whiskers',
        species: defineSpecies({ id: 'cat' }),
        clock,
        rng,
        skills,
        modules: [router],
        persistence: false,
      });
      const events: DomainEvent[] = [];
      agent.subscribe((e) => events.push({ ...e }));

      for (let i = 0; i < 3; i++) {
        agent.interact('forced');
        clock.advance(16);
        await agent.tick(0.016);
        // Second tick lets the reactive handler fire (perceived events come
        // from the prior tick's bus drain).
        clock.advance(16);
        await agent.tick(0.016);
      }

      const failures = events.filter((e) => e.type === SKILL_FAILED);
      const rngDraws = Array.from({ length: 6 }, () => agent.rng.next());
      return { failures, rngDraws };
    }

    const a = await runOnce();
    const b = await runOnce();
    expect(a.failures).toEqual(b.failures);
    expect(a.failures.length).toBe(3);
    expect(a.rngDraws).toEqual(b.rngDraws);
  });

  it('long replay — 1000 virtual seconds with random events + modifiers is byte-identical', async () => {
    async function longRun(): Promise<ReplayResult> {
      const { agent, clock, events } = buildPet();
      const traces: DecisionTrace[] = [];
      for (let i = 0; i < 200; i++) {
        clock.advance(5_000);
        traces.push(await agent.tick(5));
        // Sprinkle interactions at regular intervals to exercise mood +
        // modifier rotations + skill flow alongside the random-event ticker.
        if (i % 7 === 0) agent.interact('feed');
        if (i % 11 === 0) agent.interact('play');
        if (i % 13 === 0) agent.interact('clean');
      }
      return { traces, events, finalState: agent.getState() };
    }

    const a = await longRun();
    const b = await longRun();
    expect(a.traces).toEqual(b.traces);
    expect(a.events).toEqual(b.events);
    expect(a.finalState).toEqual(b.finalState);
  });
});
