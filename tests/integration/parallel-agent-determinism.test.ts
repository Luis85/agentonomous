import { describe, expect, it } from 'vitest';
import {
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
  type Agent,
  type DecisionTrace,
  type DomainEvent,
} from '../../src/index.js';

/**
 * D2 — parallel-agent determinism proof.
 *
 * The existing `nurture-pet-deterministic` suite verifies that running
 * the same scenario twice yields byte-identical output. This suite
 * tightens the claim: two agents constructed from the same seed and
 * stepped in interleaved lock-step produce byte-identical
 * `DecisionTrace` sequences. That catches a distinct class of bugs —
 * anything accidentally shared across agents (module-scoped RNG, a
 * cached `Date.now()`, a reused event bus) would cause the two runs to
 * diverge here even though the solo-replay suite stays green.
 */
// Both parallel agents share the same `id`. Under a determinism contract
// the `id` is just an identity label — the RNG / clock / event bus are
// per-agent instances, and sharing the id lets us compare the full
// event + trace streams byte-identically without stripping `agentId`.
const AGENT_ID = 'whiskers';

function buildAgent(): {
  agent: Agent;
  clock: ManualClock;
  events: DomainEvent[];
} {
  const clock = new ManualClock(1_700_000_000_000);
  const rng = new SeededRng('parallel-determinism');
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

type Step = { kind: 'advance'; seconds: number } | { kind: 'interact'; verb: string };

const SCRIPT: Step[] = [
  { kind: 'advance', seconds: 2 },
  { kind: 'interact', verb: 'feed' },
  { kind: 'advance', seconds: 0.1 },
  { kind: 'advance', seconds: 4 },
  { kind: 'interact', verb: 'play' },
  { kind: 'advance', seconds: 0.05 },
  { kind: 'interact', verb: 'clean' },
  { kind: 'advance', seconds: 0.05 },
  { kind: 'interact', verb: 'pet' },
  { kind: 'advance', seconds: 0.05 },
  { kind: 'advance', seconds: 10 },
  { kind: 'interact', verb: 'feed' },
  { kind: 'advance', seconds: 0.1 },
  { kind: 'advance', seconds: 20 },
];

async function runStep(
  step: Step,
  agent: Agent,
  clock: ManualClock,
  traces: DecisionTrace[],
): Promise<void> {
  if (step.kind === 'interact') {
    agent.interact(step.verb);
    return;
  }
  clock.advance(step.seconds * 1000);
  traces.push(await agent.tick(step.seconds));
}

describe('parallel-agent determinism (D2)', () => {
  it('two agents with identical seeds, stepped in interleaved lock-step, are byte-identical', async () => {
    const a = buildAgent();
    const b = buildAgent();
    const tracesA: DecisionTrace[] = [];
    const tracesB: DecisionTrace[] = [];

    // Interleave: A then B for every step. A module-scoped leak would
    // cause B's trace to see A's RNG cursor / wall time / bus state and
    // diverge from a solo replay.
    for (const step of SCRIPT) {
      await runStep(step, a.agent, a.clock, tracesA);
      await runStep(step, b.agent, b.clock, tracesB);
    }

    expect(tracesA.length).toBe(tracesB.length);
    expect(tracesA).toEqual(tracesB);
    expect(a.events).toEqual(b.events);
    expect(a.agent.getState()).toEqual(b.agent.getState());
  });

  it('reversed interleave (B then A) produces the same traces — order-independence', async () => {
    const a = buildAgent();
    const b = buildAgent();
    const tracesA: DecisionTrace[] = [];
    const tracesB: DecisionTrace[] = [];

    for (const step of SCRIPT) {
      await runStep(step, b.agent, b.clock, tracesB);
      await runStep(step, a.agent, a.clock, tracesA);
    }

    expect(tracesA).toEqual(tracesB);
  });

  it('fresh vs solo-replay — parallel traces match a solo replay of the same script', async () => {
    const solo = buildAgent();
    const soloTraces: DecisionTrace[] = [];
    for (const step of SCRIPT) {
      await runStep(step, solo.agent, solo.clock, soloTraces);
    }

    const parallel = buildAgent();
    const parallelTraces: DecisionTrace[] = [];
    const sibling = buildAgent();
    const siblingTraces: DecisionTrace[] = [];
    for (const step of SCRIPT) {
      await runStep(step, parallel.agent, parallel.clock, parallelTraces);
      await runStep(step, sibling.agent, sibling.clock, siblingTraces);
    }

    expect(parallelTraces).toEqual(soloTraces);
  });
});
