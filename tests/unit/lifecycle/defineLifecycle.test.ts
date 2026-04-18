import { describe, expect, it } from 'vitest';
import { defineLifecycle } from '../../../src/lifecycle/defineLifecycle.js';
import { stageAllowsSkill } from '../../../src/lifecycle/StageCapabilities.js';

describe('defineLifecycle', () => {
  it('sorts the schedule by atSeconds', () => {
    const desc = defineLifecycle({
      schedule: [
        { stage: 'elder', atSeconds: 100 },
        { stage: 'egg', atSeconds: 0 },
        { stage: 'adult', atSeconds: 50 },
      ],
    });
    expect(desc.schedule.map((s) => s.stage)).toEqual(['egg', 'adult', 'elder']);
  });

  it('passes capability maps through', () => {
    const desc = defineLifecycle({
      schedule: [{ stage: 'kitten', atSeconds: 0 }],
      capabilities: { kitten: { deny: ['trade'] } },
    });
    expect(desc.capabilities).toBeDefined();
    expect(stageAllowsSkill(desc.capabilities, 'kitten', 'trade')).toBe(false);
    expect(stageAllowsSkill(desc.capabilities, 'kitten', 'feed')).toBe(true);
  });
});

describe('stageAllowsSkill', () => {
  it('returns true with no capabilities', () => {
    expect(stageAllowsSkill(undefined, 'adult', 'anything')).toBe(true);
  });

  it('respects allow-lists', () => {
    const caps = { kitten: { allow: ['play'] } };
    expect(stageAllowsSkill(caps, 'kitten', 'play')).toBe(true);
    expect(stageAllowsSkill(caps, 'kitten', 'trade')).toBe(false);
  });
});
