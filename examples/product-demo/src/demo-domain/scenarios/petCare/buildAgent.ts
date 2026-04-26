import {
  createAgent,
  defaultPetInteractionModule,
  defineRandomEvent,
  DirectBehaviorRunner,
  ExpressMeowSkill,
  ExpressSadSkill,
  ExpressSleepySkill,
  InMemoryMemoryAdapter,
  RandomEventTicker,
  SkillRegistry,
  type Agent,
  type SpeciesDescriptor,
} from 'agentonomous';
import { ApproachTreatSkill } from './skills/ApproachTreatSkill.js';
import { catSpecies } from './species.js';

/**
 * Stable agent id for the pet-care scenario. Doubles as the
 * `LocalStorageSnapshotAdapter` slot, so changing it would orphan
 * existing saved pets — keep it pinned across pillar refactors.
 */
const PET_AGENT_ID = 'whiskers';

/**
 * Base wall→virtual scale. The speed picker multiplies this; 1× == base.
 * Tuned alongside `catSpecies` decay rates so hunger reaches its critical
 * threshold in ~45 s of wall time at 1×, per the Phase A demo spec.
 */
export const BASE_TIME_SCALE = 10;

/** Options accepted by {@link buildAgent}. */
export type BuildAgentOptions = {
  readonly seed: string;
  readonly speciesOverride?: SpeciesDescriptor;
};

/**
 * Build the pet-care scenario's pre-wired `Agent`. The recipe — random
 * event defs, skill registry composition, and the `createAgent` call —
 * is the same one the legacy `src/main.ts` ran inline; salvaged here so
 * the upcoming Pinia `useAgentSession` store and the Wave-0 bridge can
 * share a single source of truth without a behavioural change.
 *
 * Pure TypeScript: no DOM, no Pinia, no router. Side effects (learning
 * mode wiring, modifier decorator, UI mounts) stay with the caller.
 */
export function buildAgent({ seed, speciesOverride }: BuildAgentOptions): Agent {
  // R-11: cadence tuned so a player sees 2–3 events per virtual minute.
  // R-10: messyPlay applies a `dirty` modifier so the Clean button has a
  // real reason to exist, and simultaneously applies `disobedient` so the
  // Scold button (gated by default ScoldSkill) is corrective rather than
  // abusive.
  const randomEvents = new RandomEventTicker([
    defineRandomEvent({
      id: 'mildIllness',
      probabilityPerSecond: 0.01,
      cooldownSeconds: 30,
      emit: () => ({ type: 'RandomEvent', subtype: 'mildIllness', at: 0 }),
    }),
    defineRandomEvent({
      id: 'surpriseTreat',
      probabilityPerSecond: 0.01,
      cooldownSeconds: 30,
      emit: () => ({ type: 'RandomEvent', subtype: 'surpriseTreat', at: 0 }),
    }),
    defineRandomEvent({
      id: 'messyPlay',
      probabilityPerSecond: 0.008,
      cooldownSeconds: 30,
      emit: () => ({ type: 'RandomEvent', subtype: 'messyPlay', at: 0 }),
    }),
  ]);

  // `createAgent({ modules: [defaultPetInteractionModule] })` auto-installs
  // that module's active-care skills (feed/clean/play/rest/pet/scold/
  // medicate), so they are not pre-registered here. The expressive +
  // approach skills below are not bundled in any module, so they still
  // need manual registration.
  const skills = new SkillRegistry();
  skills.register(ExpressMeowSkill);
  skills.register(ExpressSadSkill);
  skills.register(ExpressSleepySkill);
  skills.register(ApproachTreatSkill);

  const pet = createAgent({
    id: PET_AGENT_ID,
    name: 'Whiskers',
    species: speciesOverride ?? catSpecies,
    timeScale: BASE_TIME_SCALE,
    rng: seed,
    memory: new InMemoryMemoryAdapter(),
    modules: [defaultPetInteractionModule],
    skills,
    // Behavior runner — only consulted for reasoner-committed intentions.
    // Player button interactions invoke skills directly via
    // `pet.invokeSkill` and bypass this table. The single mapping routes
    // the BT cognition mode's `approach-treat` interrupt intention to its
    // namesake skill.
    behavior: new DirectBehaviorRunner({
      skillByIntentionType: {
        'approach-treat': 'approach-treat',
      },
    }),
    randomEvents,
  });

  wirePetCareEventModifiers(pet);
  return pet;
}

/**
 * Subscribe scenario-specific modifier reactions to the agent's
 * `RandomEvent` stream. Lifted verbatim from the legacy `src/main.ts`
 * decorator block so the modifier side-effects (sick / happy-glow /
 * dirty / disobedient) ride with the agent regardless of whether the
 * caller is the Wave-0 bridge or the Pinia `useAgentSession` store.
 *
 * `Modifier.expiresAt` is wall-clock ms — it does NOT scale with
 * `setTimeScale`. At 8× the pet ages eight times faster but a 45 000 ms
 * `sick` modifier still expires after 45 s of real time. See
 * `CLAUDE.md → setTimeScale(0) pause semantics` for the full quirk.
 *
 * The returned unsubscribe is intentionally discarded: the listener is
 * scoped to the agent's own bus, so the listener's lifetime is bounded
 * by the agent's. Snapshot reset / replay rebuilds a fresh agent (and
 * a fresh bus); the orphaned listener becomes unreachable along with
 * the old agent.
 */
function wirePetCareEventModifiers(pet: Agent): void {
  pet.subscribe((event) => {
    if (event.type !== 'RandomEvent') return;
    const re = event as { subtype?: string };
    if (re.subtype === 'mildIllness') {
      pet.applyModifier({
        id: 'sick',
        source: 'event:illness',
        appliedAt: pet.clock.now(),
        expiresAt: pet.clock.now() + 45_000,
        stack: 'refresh',
        effects: [
          {
            target: { type: 'skill-effectiveness', skillId: 'feed' },
            kind: 'multiply',
            value: 0.5,
          },
        ],
        visual: { label: 'Sick', hudIcon: '🤒', fxHint: 'sick-swirl' },
      });
    } else if (re.subtype === 'surpriseTreat') {
      pet.applyModifier({
        id: 'happy-glow',
        source: 'event:surpriseTreat',
        appliedAt: pet.clock.now(),
        expiresAt: pet.clock.now() + 20_000,
        stack: 'refresh',
        effects: [{ target: { type: 'mood-bias', category: 'playful' }, kind: 'add', value: 0.5 }],
        visual: { label: 'Happy glow', hudIcon: '🎁', fxHint: 'sparkle-gold' },
      });
    } else if (re.subtype === 'messyPlay') {
      // R-10: a mess to clean up + R-12: a reason to scold.
      pet.applyModifier({
        id: 'dirty',
        source: 'event:messyPlay',
        appliedAt: pet.clock.now(),
        expiresAt: pet.clock.now() + 120_000,
        stack: 'refresh',
        effects: [{ target: { type: 'mood-bias', category: 'sad' }, kind: 'add', value: 0.2 }],
        visual: { label: 'Dirty', hudIcon: '🧹', fxHint: 'dust-cloud' },
      });
      pet.applyModifier({
        id: 'disobedient',
        source: 'event:messyPlay',
        appliedAt: pet.clock.now(),
        expiresAt: pet.clock.now() + 60_000,
        stack: 'replace',
        effects: [],
        visual: { label: 'Disobedient', hudIcon: '😼', fxHint: 'mischief' },
      });
    }
  });
}
