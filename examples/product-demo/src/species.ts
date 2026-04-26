import { defineSpecies, type SpeciesDescriptor } from 'agentonomous';

/**
 * Canonical product-demo pet-care cat. Needs tuned so an unattended kitten grows
 * hungry in ~45 s of wall time at the demo's base `timeScale` of 10 (so
 * "1×" = 10 virtual sec per wall sec), and the full lifecycle completes
 * in ~3 wall minutes for quick demo play.
 */
export const catSpecies: SpeciesDescriptor = defineSpecies({
  id: 'cat',
  displayName: 'Cat',
  persona: { traits: { playfulness: 0.7, sociability: 0.5, curiosity: 0.6 } },
  needs: [
    { id: 'hunger', level: 1, decayPerSec: 0.0015, criticalThreshold: 0.3 },
    { id: 'cleanliness', level: 1, decayPerSec: 0.00075, criticalThreshold: 0.25 },
    { id: 'happiness', level: 0.8, decayPerSec: 0.001, criticalThreshold: 0.25 },
    { id: 'energy', level: 1, decayPerSec: 0.00125, criticalThreshold: 0.2 },
    { id: 'health', level: 1, decayPerSec: 0.00025, criticalThreshold: 0.2 },
  ],
  lifecycle: {
    schedule: [
      { stage: 'egg', atSeconds: 0 },
      { stage: 'kitten', atSeconds: 150 },
      { stage: 'adult', atSeconds: 600 },
      { stage: 'elder', atSeconds: 1800 },
    ],
    capabilities: {
      egg: { allow: [] },
      kitten: { deny: ['scold'] },
    },
  },
  appearance: {
    shape: 'sprite',
    width: 192,
    height: 192,
    color: '#fde68a',
    visible: true,
  },
  locomotion: 'walk',
  tags: ['mammal', 'feline'],
});
