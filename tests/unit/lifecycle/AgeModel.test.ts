import { describe, expect, it } from 'vitest';
import { AgeModel } from '../../../src/lifecycle/AgeModel.js';

describe('AgeModel', () => {
  it('advances age and emits no transitions before the first threshold', () => {
    const model = new AgeModel({
      bornAt: 0,
      schedule: [
        { stage: 'baby', atSeconds: 0 },
        { stage: 'adult', atSeconds: 100 },
      ],
    });
    const t = model.advance(50);
    expect(t).toHaveLength(0);
    expect(model.ageSeconds).toBe(50);
    expect(model.stage).toBe('baby');
  });

  it('emits a transition when age crosses a threshold', () => {
    const model = new AgeModel({
      bornAt: 0,
      schedule: [
        { stage: 'baby', atSeconds: 0 },
        { stage: 'adult', atSeconds: 100 },
      ],
    });
    model.advance(50);
    const t = model.advance(60);
    expect(t).toEqual([{ from: 'baby', to: 'adult', atAgeSeconds: 100 }]);
    expect(model.stage).toBe('adult');
  });

  it('is catch-up-aware: multiple transitions in one advance', () => {
    const model = new AgeModel({
      bornAt: 0,
      schedule: [
        { stage: 'egg', atSeconds: 0 },
        { stage: 'baby', atSeconds: 10 },
        { stage: 'adult', atSeconds: 50 },
        { stage: 'elder', atSeconds: 200 },
      ],
    });
    const transitions = model.advance(250);
    expect(transitions.map((t) => t.to)).toEqual(['baby', 'adult', 'elder']);
    expect(model.stage).toBe('elder');
  });

  it('markDeceased() returns the transition and becomes inert', () => {
    const model = new AgeModel({
      bornAt: 0,
      schedule: [{ stage: 'adult', atSeconds: 0 }],
    });
    const t = model.markDeceased();
    expect(t).toEqual({ from: 'adult', to: 'deceased', atAgeSeconds: 0 });

    // Further advances are ignored.
    model.advance(100);
    expect(model.ageSeconds).toBe(0);
    expect(model.stage).toBe('deceased');

    // Calling markDeceased again returns null.
    expect(model.markDeceased()).toBeNull();
  });

  it('snapshot + restore preserves age and stage', () => {
    const model = new AgeModel({
      bornAt: 0,
      schedule: [
        { stage: 'baby', atSeconds: 0 },
        { stage: 'adult', atSeconds: 100 },
      ],
    });
    model.advance(120);
    const snap = model.snapshot();
    expect(snap).toEqual({ bornAt: 0, ageSeconds: 120, stage: 'adult' });

    const copy = new AgeModel({
      bornAt: 0,
      schedule: [
        { stage: 'baby', atSeconds: 0 },
        { stage: 'adult', atSeconds: 100 },
      ],
    });
    copy.restore({ ageSeconds: snap.ageSeconds, stage: snap.stage });
    expect(copy.ageSeconds).toBe(120);
    expect(copy.stage).toBe('adult');
  });
});
