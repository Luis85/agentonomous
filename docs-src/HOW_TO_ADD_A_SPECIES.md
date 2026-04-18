# How to add a species

Species are plain data. You describe what's unique about a `cat` or `fish` or
`pigeon` once, and every agent of that species picks up the defaults.

## 1. Describe it in TypeScript

```ts
import { defineSpecies } from 'agentonomous';

export const fishSpecies = defineSpecies({
  id: 'fish',
  displayName: 'Goldfish',
  persona: { traits: { curiosity: 0.8, sociability: 0.2 } },
  needs: [
    { id: 'oxygen', level: 1, decayPerSec: 0.004, criticalThreshold: 0.3 },
    { id: 'temperature', level: 1, decayPerSec: 0.002, criticalThreshold: 0.25 },
    { id: 'hunger', level: 1, decayPerSec: 0.003, criticalThreshold: 0.3 },
    { id: 'health', level: 1, decayPerSec: 0.001, criticalThreshold: 0.2 },
  ],
  lifecycle: {
    schedule: [
      { stage: 'fry', atSeconds: 0 },
      { stage: 'juvenile', atSeconds: 60 },
      { stage: 'adult', atSeconds: 240 },
      { stage: 'elder', atSeconds: 720 },
    ],
  },
  locomotion: 'swim',
  appearance: { shape: 'sprite', width: 48, height: 32, color: '#f97316', visible: true },
  passiveModifiers: [],
  allowedSkills: ['feed', 'clean'],
  dialogueCapable: false,
  tags: ['aquatic'],
});
```

## 2. Or describe it as JSON

Matches `schema/species.schema.json`:

```json
{
  "id": "fish",
  "displayName": "Goldfish",
  "needs": [{ "id": "oxygen", "level": 1, "decayPerSec": 0.004, "criticalThreshold": 0.3 }],
  "lifecycle": {
    "schedule": [
      { "stage": "fry", "atSeconds": 0 },
      { "stage": "adult", "atSeconds": 240 }
    ]
  },
  "locomotion": "swim"
}
```

Load it with your bundler's JSON support and pass to `defineSpecies`:

```ts
import fishJson from './fish.species.json' with { type: 'json' };
import { defineSpecies } from 'agentonomous';

export const fishSpecies = defineSpecies(fishJson);
```

## 3. Optionally: register several species

When you're juggling multiple species types, a `SpeciesRegistry` gives you
string-lookup convenience:

```ts
import { SpeciesRegistry, createAgent } from 'agentonomous';

const registry = new SpeciesRegistry();
registry.registerAll([catSpecies, dogSpecies, fishSpecies]);

const pet = createAgent({ id: 'whiskers', species: 'cat', speciesRegistry: registry });
```

## 4. Fine-tuning skills per species

If a fish can't be scolded or played with in the conventional sense, constrain
them via `allowedSkills` on the species or per-stage `capabilities` on the
lifecycle:

```ts
defineSpecies({
  id: 'fish',
  lifecycle: {
    schedule: [
      { stage: 'fry', atSeconds: 0 },
      { stage: 'adult', atSeconds: 240 },
    ],
    capabilities: {
      fry: { deny: ['scold', 'medicate'] },
    },
  },
});
```

## 5. Passive modifiers

Species can ship permanent buffs/debuffs. A turtle might gain a passive
`hardy` modifier that slows health decay:

```ts
defineSpecies({
  id: 'turtle',
  passiveModifiers: [
    {
      id: 'hardy',
      source: 'trait:hardy',
      appliedAt: 0,
      stack: 'replace',
      effects: [{ target: { type: 'need-decay', needId: 'health' }, kind: 'multiply', value: 0.5 }],
    },
  ],
});
```

`createAgent` applies these at construction so `ModifierApplied` events fire on
the bus — your HUD and reactive store see them immediately.

## 6. Overriding species defaults per agent

Anything declared on a species is a default. Explicit fields on `createAgent`
win:

```ts
createAgent({
  id: 'old-whiskers',
  species: catSpecies, // default persona: playfulness 0.7
  persona: { traits: { playfulness: 0.1 } }, // this individual is a curmudgeon
});
```

## 7. Testing

Every species descriptor is pure data; `defineSpecies` validates it. The
`agentonomous` test suite gives you the pattern for deterministic agent
replays — seed an `Rng`, drive a `ManualClock`, and assert on
`agent.getState()` / trace equality.
