import { describe, expect, it } from 'vitest';
import {
  AutoSaveTracker,
  DEFAULT_AUTOSAVE_POLICY,
} from '../../../src/persistence/AutoSavePolicy.js';

describe('AutoSaveTracker', () => {
  it('fires after N ticks', () => {
    const t = new AutoSaveTracker({ enabled: true, everyTicks: 3 });
    t.advance(1);
    expect(t.shouldSave()).toBe(false);
    t.advance(1);
    expect(t.shouldSave()).toBe(false);
    t.advance(1);
    expect(t.shouldSave()).toBe(true);
  });

  it('fires after N virtual seconds', () => {
    const t = new AutoSaveTracker({ enabled: true, everyVirtualSeconds: 5 });
    t.advance(1);
    t.advance(2);
    expect(t.shouldSave()).toBe(false);
    t.advance(3);
    expect(t.shouldSave()).toBe(true);
  });

  it('fires on event triggers', () => {
    const t = new AutoSaveTracker({ enabled: true, onEvents: ['AgentDied'] });
    t.advance(0.016);
    expect(t.shouldSave()).toBe(false);
    t.observeEvent('MoodChanged'); // ignored
    expect(t.shouldSave()).toBe(false);
    t.observeEvent('AgentDied');
    expect(t.shouldSave()).toBe(true);
  });

  it('markSaved resets counters', () => {
    const t = new AutoSaveTracker({ enabled: true, everyTicks: 2 });
    t.advance(1);
    t.advance(1);
    expect(t.shouldSave()).toBe(true);
    t.markSaved();
    expect(t.shouldSave()).toBe(false);
  });

  it('disabled policy never fires', () => {
    const t = new AutoSaveTracker({ enabled: false, everyTicks: 1 });
    t.advance(5);
    t.observeEvent('AgentDied');
    expect(t.shouldSave()).toBe(false);
  });

  it('default policy fires every 5 ticks + on AgentDied', () => {
    const t = new AutoSaveTracker(DEFAULT_AUTOSAVE_POLICY);
    for (let i = 0; i < 4; i++) t.advance(1);
    expect(t.shouldSave()).toBe(false);
    t.advance(1);
    expect(t.shouldSave()).toBe(true);
  });

  it('treats negative / zero / NaN / Infinity everyTicks as disabled', () => {
    for (const bad of [-1, 0, NaN, Infinity, -Infinity]) {
      const t = new AutoSaveTracker({ enabled: true, everyTicks: bad });
      t.advance(1);
      expect(t.shouldSave()).toBe(false);
      t.advance(1000);
      expect(t.shouldSave()).toBe(false);
    }
  });

  it('treats negative / zero / NaN / Infinity everyVirtualSeconds as disabled', () => {
    for (const bad of [-5, 0, NaN, Infinity, -Infinity]) {
      const t = new AutoSaveTracker({ enabled: true, everyVirtualSeconds: bad });
      t.advance(10);
      expect(t.shouldSave()).toBe(false);
    }
  });
});
