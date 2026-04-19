# agentonomous

Autonomous agent library for TypeScript simulations. Engine-agnostic, fully
testable, designed to nurture an agent from birth to death in the browser with
zero configuration.

**Status:** pre-release (`0.1.0`). The Phase A MVP — a virtual-pet nurture demo
— ships in `examples/nurture-pet`.

## What you get

- **An `Agent` class** with a deterministic tick pipeline: perceive → random
  events → expire modifiers → decay needs → evaluate mood → reconcile
  animation → dispatch by control mode → run cognition → execute skills →
  persist + autosave.
- **Homeostatic needs** (hunger, energy, …) that decay over virtual time and
  recover via skill invocation.
- **Buff/debuff modifiers** — stackable, replace, refresh, or ignore policies;
  cross-cutting effects on decay, mood, skill effectiveness, intention
  scoring, locomotion speed, lifespan.
- **Lifecycle + mood** — birth → growth → aging → death, catch-up-aware;
  categorical mood derived from needs + modifiers + persona; `agent.kill(reason)`
  for narrative deaths; `agent.getState()` surfaces everything for reactive
  stores.
- **Runtime time control** — `agent.setTimeScale(scale)` changes the
  wall→virtual time multiplier mid-run; new scale takes effect from the
  next tick (determinism preserved). `setTimeScale(0)` freezes virtual-time
  progress without killing the agent. `getTimeScale()` reads the current value.
- **Cognition** — `UrgencyReasoner` default picks the highest-scored intention;
  `DirectBehaviorRunner` maps intentions to skill invocations;
  `Expressive` / `Active` / `Composed` needs policies.
- **Skills** — typed `Skill` + `SkillRegistry` + 10 default skills
  (feed/clean/play/rest/pet/scold/medicate + express-meow/sad/sleepy).
- **Animation state machine** driven by mood + active skill + modifiers.
- **Control modes** — autonomous / scripted / remote. Works as NPC, bot, or
  player-proxy.
- **Species-agnostic** — cats, fish, birds, humans all live in the same
  abstraction; data-driven species descriptors via `defineSpecies`.
- **Persistence** — `agent.snapshot()` + versioned schema, `SnapshotStorePort`
  with `InMemory`/`LocalStorage`/`Fs` adapters, auto-save policy, offline
  catch-up on restore.
- **Random events** — seeded per-tick probability table with cooldowns.
- **Reactive store binding** — `bindAgentToStore(agent, listener)` works with
  Pinia / Zustand / Redux / Svelte stores / signals.
- **Integrations** — `agentonomous/integrations/excalibur` (Actor sync,
  remote controller, animation bridge).

## Quickstart

```bash
npm install agentonomous
```

```ts
import { createAgent, defineSpecies } from 'agentonomous';

const cat = defineSpecies({
  id: 'cat',
  persona: { traits: { playfulness: 0.7 } },
  needs: [
    { id: 'hunger', level: 1, decayPerSec: 0.01 },
    { id: 'energy', level: 1, decayPerSec: 0.008 },
    { id: 'happiness', level: 0.8, decayPerSec: 0.005 },
    { id: 'health', level: 1, decayPerSec: 0.001 },
  ],
  lifecycle: {
    schedule: [
      { stage: 'kitten', atSeconds: 0 },
      { stage: 'adult', atSeconds: 120 },
      { stage: 'elder', atSeconds: 600 },
    ],
  },
});

const whiskers = createAgent({ id: 'whiskers', species: cat, timeScale: 60 });

// Player interactions flow through the bus → default skill module.
whiskers.interact('feed');

// Adjust simulation speed at any time (new scale applies next tick).
whiskers.setTimeScale(0); // pause
whiskers.setTimeScale(60); // resume at 1× (60 virtual-s per real-s)
whiskers.setTimeScale(480); // 8× fast-forward

// Game loop.
let last = performance.now();
function frame(now: number) {
  void whiskers.tick((now - last) / 1000);
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

That's the whole MVP surface. See `examples/nurture-pet` for a full browser
demo with HUD, buffs, random events, and localStorage persistence.

### Interaction flow

`agent.interact(verb, params?)` is the recommended entrypoint for UI- or
host-triggered actions. It publishes an `InteractionRequested` event on the
agent's bus. Reactive handlers — the `defaultPetInteractionModule` ships
with one — translate verbs into `invokeSkill(...)` calls:

```
click → agent.interact('feed')
  └─► InteractionRequested (on bus)
      └─► defaultPetInteractionModule handler
          └─► agent.invokeSkill('feed', …)
              └─► FeedSkill.execute(ctx)
                  └─► SkillCompleted + effects (needs, modifiers)
```

If you route your own verbs, register a module with a `reactiveHandlers`
entry keyed on `'InteractionRequested'`. The `AgentFacade` passed to the
handler gives you `facade.invokeSkill(id, params)` without reaching for the
`Agent` directly.

### Advanced: random events + custom skills

```ts
import {
  createAgent,
  defineRandomEvent,
  defineSpecies,
  err,
  ok,
  RandomEventTicker,
  SkillRegistry,
  type Skill,
} from 'agentonomous';

const rainstorm: Skill = {
  id: 'rainstorm',
  label: 'Rainstorm',
  baseEffectiveness: 1,
  execute(_params, ctx) {
    if (!ctx.hasModifier('outside')) {
      return Promise.resolve(err({ code: 'indoors', message: 'Pet is inside.' }));
    }
    ctx.applyModifier({
      id: 'wet',
      source: 'skill:rainstorm',
      appliedAt: ctx.clock.now(),
      expiresAt: ctx.clock.now() + 30_000,
      stack: 'refresh',
      effects: [{ target: { type: 'mood-bias', category: 'sad' }, kind: 'add', value: 0.2 }],
    });
    return Promise.resolve(ok({ fxHint: 'rain-drops' }));
  },
};

const skills = new SkillRegistry();
skills.register(rainstorm);

const randomEvents = new RandomEventTicker([
  defineRandomEvent({
    id: 'weather:rain',
    probabilityPerSecond: 0.005,
    cooldownSeconds: 120,
    emit: () => ({ type: 'RandomEvent', subtype: 'rain', at: 0 }),
  }),
]);

const pet = createAgent({
  id: 'whiskers',
  species: defineSpecies({ id: 'cat' }),
  skills,
  randomEvents,
});
```

Skills return `ok(...)` for success or `err(...)` for expected failure. A
thrown exception is caught by the tick pipeline and surfaced as
`SkillFailed` with `code: 'execution-threw'` — no RNG draws happen between
the throw and the next tick, so replay stays deterministic.

### Running the example

The `examples/nurture-pet` demo consumes the library via a workspace-local
build. You must build the library before the example resolves it:

```bash
# From the repo root.
npm install
npm run build                       # → dist/ populated so the example can import

# Install the example's own deps + start Vite dev server.
cd examples/nurture-pet
npm install
npm run dev
```

Open the printed `http://localhost:5173/` URL. Feed, pet, clean, and watch
the pet grow up, get hungry, and eventually die (with a life-summary modal
and a "New pet" button). LocalStorage persists the pet across reloads. The
HUD includes a **speed picker** (Pause / 0.5× / 1× / 2× / 4× / 8× — also
persisted) and a **Reset** button (confirm-gated) for a fresh start.

## Determinism

Under a fixed `SeededRng` + `ManualClock`, every tick produces a
byte-identical `DecisionTrace`. Tests assert this directly:

```ts
const runA = await runScriptedReplay();
const runB = await runScriptedReplay();
expect(runA.traces).toEqual(runB.traces);
expect(runA.events).toEqual(runB.events);
expect(runA.finalState).toEqual(runB.finalState);
```

The library forbids raw `Date.now()` / `Math.random()` / `setTimeout` inside
its own code via ESLint rules — all non-determinism flows through the
`WallClock`, `Rng`, and `RemoteController` ports.

## Adding your own species

Species are pure data. Drop a JSON file under `species/` (schema:
[`schema/species.schema.json`](./schema/species.schema.json)), load it, and
pass the result to `createAgent`:

```ts
import catJson from './species/cat.species.json' with { type: 'json' };
import { defineSpecies, createAgent } from 'agentonomous';

const cat = defineSpecies(catJson);
const pet = createAgent({ id: 'whiskers', species: cat });
```

Any species descriptor can declare: `needs`, `lifecycle`, `persona`,
`appearance`, `locomotion`, `passiveModifiers`, `allowedSkills`,
`dialogueCapable`. Explicit config on `createAgent` overrides descriptor
defaults.

## Reactive store (Pinia, Zustand, …)

`bindAgentToStore` takes any listener; wire it into whichever reactive
store you use. A Pinia example end-to-end:

```ts
// stores/pet.ts
import { defineStore } from 'pinia';
import type { AgentState } from 'agentonomous';

export const usePetStore = defineStore('pet', {
  state: (): { snapshot: AgentState | null } => ({ snapshot: null }),
  actions: {
    syncFromAgent(state: AgentState): void {
      this.snapshot = state;
    },
  },
});
```

```ts
// main.ts
import { bindAgentToStore, createAgent, defineSpecies } from 'agentonomous';
import { usePetStore } from './stores/pet';

const pet = createAgent({ id: 'whiskers', species: defineSpecies({ id: 'cat' }) });
const store = usePetStore();

const unsubscribe = bindAgentToStore(pet, (state) => {
  store.syncFromAgent(state);
});
```

The listener fires synchronously on every event and receives the current
`getState()` slice (`id`, `stage`, `needs`, `modifiers`, `mood`,
`animation`, `halted`, `ageSeconds`). Call `unsubscribe()` to detach.

## Development

```bash
nvm use               # node 22
npm install
npm test              # vitest
npm run typecheck     # tsc --noEmit
npm run lint          # eslint 9 flat config
npm run build         # vite library mode → dist/
npm run docs          # typedoc → docs/
npm run analyze       # build + list the 20 largest dist/*.js files by bytes
```

### Bundle-size budget

The library's core bundle (everything re-exported from
`agentonomous`) targets ~80 KB unminified ESM. The
`agentonomous/integrations/excalibur` subpath is a separate entry so
consumers who don't use Excalibur don't pay for it. Run
`npm run analyze` after meaningful changes; a significant regression is a
signal to check for accidentally-bundled adapters or heavy deps.

Phase A milestones (M0–M15) are all green. Phase B (sim-ecs adapter, LLM
tool, Markdown memory, social/dialogue, possession/jobs, Mistreevous BTs,
JS-son BDI, brain.js learning) lands post-V1.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch model, commit style, PR
conventions, and the release flow. TL;DR: work on a topic branch cut from
`develop`, PR against `develop`, keep commits small and reversible.

## License

MIT — see [LICENSE](./LICENSE).
