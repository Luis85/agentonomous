import { defineSpecies, type SpeciesDescriptor } from 'agentonomous';

/**
 * Canonical nurture-pet cat. Needs tuned so an unattended kitten grows
 * hungry in ~45 s of wall time at `timeScale: 60` (i.e., 45 virtual
 * minutes), and the full lifecycle completes in ~3 wall minutes for
 * quick demo play.
 */
export const catSpecies: SpeciesDescriptor = defineSpecies({
  id: 'cat',
  displayName: 'Cat',
  persona: { traits: { playfulness: 0.7, sociability: 0.5, curiosity: 0.6 } },
  needs: [
    { id: 'hunger', level: 1, decayPerSec: 0.006, criticalThreshold: 0.3 },
    { id: 'cleanliness', level: 1, decayPerSec: 0.003, criticalThreshold: 0.25 },
    { id: 'happiness', level: 0.8, decayPerSec: 0.004, criticalThreshold: 0.25 },
    { id: 'energy', level: 1, decayPerSec: 0.005, criticalThreshold: 0.2 },
    { id: 'health', level: 1, decayPerSec: 0.001, criticalThreshold: 0.2 },
  ],
  lifecycle: {
    schedule: [
      { stage: 'egg', atSeconds: 0 },
      { stage: 'kitten', atSeconds: 30 },
      { stage: 'adult', atSeconds: 120 },
      { stage: 'elder', atSeconds: 360 },
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
