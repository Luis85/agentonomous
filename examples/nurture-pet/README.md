# Nurture pet demo

The MVP demo for the `agentonomous` library. A virtual pet you can nurture
from birth to death — feed it, clean it, play, rest, scold, medicate —
and watch it react and act autonomously between your inputs.

## What it demonstrates

- `createAgent({ species })` with a rich `SpeciesDescriptor` (cat).
- Full pipeline: needs decay, modifier buffs (`well-fed`, `sick`,
  `happy-glow`), lifecycle stages (egg → kitten → adult → elder),
  categorical mood (happy / sad / playful / sick), animation state
  machine driven by mood + active skill + modifiers.
- Random events: `surpriseTreat` boosts mood, `mildIllness` applies a
  `sick` modifier that slows feeding.
- `defaultPetInteractionModule` wires UI button clicks
  (`pet.interact('feed')` etc.) to the default skill library.
- Zero-config persistence via `LocalStorageSnapshotStore` — close the tab
  and the pet remembers.
- Event-driven UI refresh via `agent.subscribe(AGENT_TICKED)` — a single listener reads the full `DecisionTrace` off `event.trace` and drives HUD + trace panel each tick. The rAF loop is a pure tick driver.
- **Runtime speed control** via `agent.setTimeScale(scale)` — HUD exposes
  Pause / 0.5× / 1× / 2× / 4× / 8× buttons. The chosen speed persists to
  `localStorage` across reloads (separate from the agent snapshot).
- **Live modifier tray** — active buffs/debuffs shown with their
  `Modifier.visual.hudIcon` and a remaining-time countdown. Reads "paused"
  when timeScale is 0 to avoid leaking wall-clock countdown during a pause.
- **Humanized age + stage** — "Kitten — 23s old" instead of raw seconds.
- **Reset / New pet flow** — a confirm-gated "🔄 Reset" button in the HUD
  speed bar, and a "🔄 New pet" button in the death modal. Both wipe the
  snapshot from `localStorage` and reload; speed preference is preserved.

## Running locally

Build the core library first (the demo workspace-links against `dist/`):

```bash
# in the project root
npm install
npm run build
```

Then start the demo:

```bash
cd examples/nurture-pet
npm install
npm run dev
```

Open http://localhost:5173 and play.

## Pinia / Zustand / Redux

The HUD in this demo is vanilla DOM, but the same
`bindAgentToStore(agent, listener)` helper wires any reactive framework.
For Pinia:

```ts
import { defineStore } from 'pinia';
import { bindAgentToStore } from 'agentonomous';

export const usePetStore = defineStore('pet', {
  state: () => ({ needs: {}, stage: 'egg', mood: 'content', halted: false }),
  actions: {
    syncFromAgent(s) {
      Object.assign(this, s);
    },
  },
});

const store = usePetStore();
bindAgentToStore(pet, (state) => store.syncFromAgent(state));
```

## Event-driven UI refresh

`AgentTicked` fires once per non-halted tick, carrying the full
`DecisionTrace` on its payload. This is the recommended way to drive
per-tick UI updates from a library consumer:

```ts
import { AGENT_TICKED, type AgentTickedEvent } from 'agentonomous';

const unsubscribe = pet.subscribe((event) => {
  if (event.type !== AGENT_TICKED) return;
  const ticked = event as AgentTickedEvent;
  hud.update(pet.getState());
  traceView.render(ticked.trace, pet.getState());
});

// On teardown:
unsubscribe();
```

Pair this with a `requestAnimationFrame` loop that calls
`pet.tick(dt)` but does not render — the event drives UI. See
`src/main.ts` for the reference implementation.

## localStorage key layout

| Key                                   | Purpose                                        |
| ------------------------------------- | ---------------------------------------------- |
| `agentonomous/whiskers`               | Agent snapshot (auto-save, every 5 s)          |
| `agentonomous/__agentonomous/index__` | Snapshot store index                           |
| `agentonomous/speed`                  | Speed-picker preference (not part of snapshot) |

Reset clears the first two and reloads. Speed preference survives.
