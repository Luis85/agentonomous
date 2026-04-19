import {
  AGENT_TICKED,
  createAgent,
  defaultPetInteractionModule,
  defineRandomEvent,
  ExpressMeowSkill,
  ExpressSadSkill,
  ExpressSleepySkill,
  InMemoryMemoryAdapter,
  RandomEventTicker,
  SkillRegistry,
  type AgentTickedEvent,
} from 'agentonomous';
import { catSpecies } from './species.js';
import {
  mountExportImport,
  mountHud,
  mountResetButton,
  mountSpeedPicker,
  resetSimulation,
} from './ui.js';
import { mountTraceView } from './traceView.js';
import { loadSeed, mountSeedPanel } from './seed.js';
import {
  applyOverride,
  currentEditableConfig,
  loadConfigOverride,
  mountConfigPanel,
} from './speciesConfig.js';

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

// --- Species (base + optional user JSON override) -----------------------------
const speciesOverride = loadConfigOverride(catSpecies);
const effectiveSpecies = speciesOverride ? applyOverride(catSpecies, speciesOverride) : catSpecies;

// --- Agent --------------------------------------------------------------------
const seed = loadSeed();
const pet = createAgent({
  id: STORAGE_KEY,
  name: 'Whiskers',
  species: effectiveSpecies,
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
mountConfigPanel(catSpecies, currentEditableConfig(effectiveSpecies), () =>
  resetSimulation(pet.identity.id),
);

// HUD updates run from the per-frame RAF loop below — a prior
// `bindAgentToStore` hook also called `hud.update` on every agent event,
// causing two renders on event ticks. The RAF loop already covers
// steady-state repaints.

// Additional listener to decorate mildIllness / surpriseTreat side-effects.
// Note: `Modifier.expiresAt` is wall-clock ms — it does not scale with
// `setTimeScale`. At 8× the pet ages eight times faster but a 45 000 ms
// `sick` modifier still expires after 45 s of real time. See
// `CLAUDE.md → setTimeScale(0) pause semantics` for the full quirk.
const unsubscribeModifierDecorator = pet.subscribe((event) => {
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

// Drive HUD + trace panel off the AgentTicked bus event. The event
// fires once per non-halted tick, synchronously during `pet.tick(dt)`,
// and carries the full `DecisionTrace` on its payload — no closure
// cache needed. See `InMemoryEventBus.publish` for the sync-publish
// semantics that guarantee `event.trace` matches the tick that just
// completed. The rAF loop below is a pure tick driver.
const unsubscribeUiRefresh = pet.subscribe((event) => {
  if (event.type !== AGENT_TICKED) return;
  const ticked = event as AgentTickedEvent;
  const state = pet.getState();
  hud.update(state);
  traceView.render(ticked.trace, state, ticked.tickNumber);
});

// --- Game loop ----------------------------------------------------------------
// rAF drives `pet.tick(dt)` at display refresh rate. UI refresh
// happens in the AgentTicked subscriber above — no per-frame DOM
// work here.
let last = performance.now();
let rafHandle = 0;
let stopped = false;
async function loop(now: number): Promise<void> {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  await pet.tick(dt);
  if (stopped) return;
  rafHandle = requestAnimationFrame((t) => {
    void loop(t);
  });
}
rafHandle = requestAnimationFrame((t) => {
  last = t;
  void loop(t);
});

/**
 * Tear down the demo cleanly: stop the RAF loop, drop the modifier-decorator
 * subscription, and dispose the HUD's event subscription. Safe to call
 * multiple times. The production flow resets via `location.reload()` so
 * this path is mostly a safety net for future in-place reset flows and for
 * HMR correctness (it prevents listener stacks across hot reloads).
 */
function disposeDemo(): void {
  if (stopped) return;
  stopped = true;
  if (rafHandle !== 0) cancelAnimationFrame(rafHandle);
  unsubscribeModifierDecorator();
  unsubscribeUiRefresh();
  hud.dispose();
}

// Wire Vite HMR teardown so an edit-triggered reload doesn't stack a second
// RAF loop / subscription on top of the old one. Typed inline to avoid
// depending on `vite/client` ambient types from the demo tsconfig.
const meta = import.meta as unknown as { hot?: { dispose: (cb: () => void) => void } };
if (meta.hot) meta.hot.dispose(disposeDemo);
