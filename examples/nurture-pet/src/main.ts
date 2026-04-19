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
import { mountExportImport, mountHud, mountResetButton, mountSpeedPicker } from './ui.js';
import { mountTraceView } from './traceView.js';
import { loadSeed, mountSeedPanel } from './seed.js';

const STORAGE_KEY = 'whiskers';
const SPEED_STORAGE_KEY = 'agentonomous/speed';
const LEGACY_SPEED_STORAGE_KEY = 'whiskers:speed';

// D4: one-shot migration from the old `whiskers:speed` key to the
// prefix-aligned `agentonomous/speed`. Runs once per browser on the
// first load after this change ships; subsequent loads find no legacy
// key and no-op.
try {
  const legacy = globalThis.localStorage?.getItem(LEGACY_SPEED_STORAGE_KEY);
  if (legacy !== null && legacy !== undefined) {
    if (globalThis.localStorage?.getItem(SPEED_STORAGE_KEY) === null) {
      globalThis.localStorage?.setItem(SPEED_STORAGE_KEY, legacy);
    }
    globalThis.localStorage?.removeItem(LEGACY_SPEED_STORAGE_KEY);
  }
} catch {
  // localStorage unavailable (private mode, quota) — skip migration.
}
// Base wall→virtual scale. The speed picker multiplies this; 1× == base.
// Tuned alongside catSpecies decay rates so hunger reaches its critical
// threshold in ~45 s of wall time at 1×, per the Phase A demo spec.
const BASE_TIME_SCALE = 10;

// --- Random events ------------------------------------------------------------
// R-11: cadence tuned so a player sees 2–3 events per virtual minute.
// R-10: messyPlay applies a `dirty` modifier so the Clean button has a real
// reason to exist, and simultaneously applies `disobedient` so the Scold
// button (gated by default ScoldSkill) is corrective rather than abusive.
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

// --- Skill registry populated with active + expressive defaults ---------------
const skills = new SkillRegistry();
skills.registerAll(defaultPetInteractionModule.skills ?? []);
skills.register(ExpressMeowSkill);
skills.register(ExpressSadSkill);
skills.register(ExpressSleepySkill);

// --- Agent --------------------------------------------------------------------
const seed = loadSeed();
const pet = createAgent({
  id: STORAGE_KEY,
  name: 'Whiskers',
  species: catSpecies,
  timeScale: BASE_TIME_SCALE,
  rng: seed,
  memory: new InMemoryMemoryAdapter(),
  modules: [defaultPetInteractionModule],
  skills,
  randomEvents,
});

// --- Mount UI + reactive binding ----------------------------------------------
const hud = mountHud(pet);
const traceView = mountTraceView(pet);
mountSpeedPicker(pet, { baseScale: BASE_TIME_SCALE, storageKey: SPEED_STORAGE_KEY });
mountSeedPanel(pet, seed);
mountExportImport(pet);
mountResetButton(pet);
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

// --- Game loop ----------------------------------------------------------------
let last = performance.now();
async function loop(now: number): Promise<void> {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  const trace = await pet.tick(dt);
  traceView.render(trace, pet.getState());
  requestAnimationFrame((t) => {
    void loop(t);
  });
}
requestAnimationFrame((t) => {
  last = t;
  void loop(t);
});
