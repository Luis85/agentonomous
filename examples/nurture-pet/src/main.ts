import {
  createAgent,
  defaultPetInteractionModule,
  defineRandomEvent,
  ExpressMeowSkill,
  ExpressSadSkill,
  ExpressSleepySkill,
  InMemoryMemoryAdapter,
  RandomEventTicker,
  SkillRegistry,
  bindAgentToStore,
} from 'agentonomous';
import { catSpecies } from './species.js';
import { mountHud } from './ui.js';

const STORAGE_KEY = 'whiskers';

// --- Random events ------------------------------------------------------------
const randomEvents = new RandomEventTicker([
  defineRandomEvent({
    id: 'mildIllness',
    probabilityPerSecond: 0.002,
    cooldownSeconds: 60,
    emit: () => ({ type: 'RandomEvent', subtype: 'mildIllness', at: 0 }),
  }),
  defineRandomEvent({
    id: 'surpriseTreat',
    probabilityPerSecond: 0.001,
    cooldownSeconds: 90,
    emit: () => ({ type: 'RandomEvent', subtype: 'surpriseTreat', at: 0 }),
  }),
]);

// --- Skill registry populated with active + expressive defaults ---------------
const skills = new SkillRegistry();
skills.registerAll(defaultPetInteractionModule.skills ?? []);
skills.register(ExpressMeowSkill);
skills.register(ExpressSadSkill);
skills.register(ExpressSleepySkill);

// --- Agent --------------------------------------------------------------------
const pet = createAgent({
  id: STORAGE_KEY,
  name: 'Whiskers',
  species: catSpecies,
  timeScale: 60,
  rng: STORAGE_KEY,
  memory: new InMemoryMemoryAdapter(),
  modules: [defaultPetInteractionModule],
  skills,
  randomEvents,
});

// --- Mount UI + reactive binding ----------------------------------------------
const hud = mountHud(pet);
bindAgentToStore(pet, (state) => {
  hud.update(state);
});

// Additional listener to decorate mildIllness / surpriseTreat side-effects.
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
        { target: { type: 'skill-effectiveness', skillId: 'feed' }, kind: 'multiply', value: 0.5 },
      ],
      visual: { hudIcon: '🤒', fxHint: 'sick-swirl' },
    });
  } else if (re.subtype === 'surpriseTreat') {
    pet.applyModifier({
      id: 'happy-glow',
      source: 'event:surpriseTreat',
      appliedAt: pet.clock.now(),
      expiresAt: pet.clock.now() + 20_000,
      stack: 'refresh',
      effects: [{ target: { type: 'mood-bias', category: 'playful' }, kind: 'add', value: 0.5 }],
      visual: { hudIcon: '🎁', fxHint: 'sparkle-gold' },
    });
  }
});

// --- Game loop ----------------------------------------------------------------
let last = performance.now();
async function loop(now: number): Promise<void> {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  await pet.tick(dt);
  requestAnimationFrame((t) => {
    void loop(t);
  });
}
requestAnimationFrame((t) => {
  last = t;
  void loop(t);
});
