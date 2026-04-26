import { AGENT_TICKED, type AgentTickedEvent } from 'agentonomous';
import { BASE_TIME_SCALE, buildAgent } from './demo-domain/scenarios/petCare/buildAgent.js';
import { setLearningAgent } from './demo-domain/scenarios/petCare/cognition/learning.js';
import { mountCognitionSwitcher } from './cognitionSwitcher.js';
import { catSpecies } from './demo-domain/scenarios/petCare/species.js';
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

// --- Species (base + optional user JSON override) -----------------------------
const speciesOverride = loadConfigOverride(catSpecies);
const effectiveSpecies = speciesOverride ? applyOverride(catSpecies, speciesOverride) : catSpecies;

// --- Agent --------------------------------------------------------------------
const seed = loadSeed();
const pet = buildAgent({ seed, speciesOverride: effectiveSpecies });

// Wire the learning mode to the agent: scopes the persisted-network
// localStorage key per-pet AND subscribes to the standard event bus to
// feed the mood / modifier-count / event-count dims of
// `featuresFromNeeds`.
setLearningAgent(pet);

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
const cognitionSwitcherRoot = document.querySelector<HTMLElement>('#cognition-switcher');
if (!cognitionSwitcherRoot) {
  throw new Error('main: #cognition-switcher slot not found in index.html');
}
const cognitionSwitcher = mountCognitionSwitcher(pet, cognitionSwitcherRoot);

// HUD updates run from the per-frame RAF loop below — a prior
// `bindAgentToStore` hook also called `hud.update` on every agent event,
// causing two renders on event ticks. The RAF loop already covers
// steady-state repaints.

// Random-event modifier wiring (sick / happy-glow / dirty / disobedient)
// now lives inside `buildAgent` so the same scenario behaviour rides the
// Wave-0 bridge and the upcoming `useAgentSession` store path.

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
// work here, except a one-shot HUD render on the halt transition
// (AgentTicked doesn't fire on halted ticks by library spec, so
// without this fallback the HUD would stay frozen at the
// pre-death state after the agent dies).
let last = performance.now();
let rafHandle = 0;
let stopped = false;
let haltRendered = false;
async function loop(now: number): Promise<void> {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  const trace = await pet.tick(dt);
  if (stopped) return;
  if (trace.halted && !haltRendered) {
    haltRendered = true;
    hud.update(pet.getState());
  }
  rafHandle = requestAnimationFrame((t) => {
    void loop(t);
  });
}
rafHandle = requestAnimationFrame((t) => {
  last = t;
  void loop(t);
});

/**
 * Tear down the demo cleanly: stop the RAF loop and dispose the HUD's
 * event subscription. Safe to call multiple times. The production flow
 * resets via `location.reload()` so this path is mostly a safety net
 * for future in-place reset flows and for HMR correctness (it prevents
 * listener stacks across hot reloads). The modifier-decorator listener
 * is bound by `buildAgent` and tied to the agent's own bus, so it is
 * GC'd along with the agent — no explicit unsubscribe needed.
 */
function disposeDemo(): void {
  if (stopped) return;
  stopped = true;
  if (rafHandle !== 0) cancelAnimationFrame(rafHandle);
  unsubscribeUiRefresh();
  cognitionSwitcher.dispose();
  hud.dispose();
}

// Wire Vite HMR teardown so an edit-triggered reload doesn't stack a second
// RAF loop / subscription on top of the old one. Typed inline to avoid
// depending on `vite/client` ambient types from the demo tsconfig.
const meta = import.meta as unknown as { hot?: { dispose: (cb: () => void) => void } };
if (meta.hot) meta.hot.dispose(disposeDemo);
