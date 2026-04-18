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
- Reactive state binding via `bindAgentToStore` + a minimal DOM HUD.
- Compressed `timeScale: 60` (1 real minute ≈ 1 virtual hour).

## Running locally

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
