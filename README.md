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
`WallClock`, `Rng`, `RemoteController`, and `LlmProviderPort` ports.

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

```ts
import { bindAgentToStore } from 'agentonomous';

const unsubscribe = bindAgentToStore(pet, (state) => {
  store.syncFromAgent(state);
});
```

The listener fires synchronously on every event and receives the current
`getState()` slice (id, stage, needs, modifiers, mood, animation, halted,
ageSeconds).

## Development

```bash
nvm use               # node 22
npm install
npm test              # vitest
npm run typecheck     # tsc --noEmit
npm run lint          # eslint 9 flat config
npm run build         # vite library mode → dist/
npm run docs          # typedoc → docs/
```

Phase A milestones (M0–M15) are all green. Phase B (sim-ecs adapter, LLM
tool, Markdown memory, social/dialogue, possession/jobs, Mistreevous BTs,
JS-son BDI, brain.js learning) lands post-V1.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch model, commit style, PR
conventions, and the release flow. TL;DR: work on a topic branch cut from
`develop`, PR against `develop`, keep commits small and reversible.

## License

MIT — see [LICENSE](./LICENSE).
