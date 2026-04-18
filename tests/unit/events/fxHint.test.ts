import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../../src/events/DomainEvent.js';
import { getFxHint, withFxHint } from '../../../src/randomEvents/fxHint.js';

describe('fxHint helpers', () => {
  it('withFxHint returns a new event with the hint attached', () => {
    const event: DomainEvent = { type: 'MoodChanged', at: 1, agentId: 'a1' };
    const decorated = withFxHint(event, 'sparkle-green');

    expect(decorated).not.toBe(event);
    expect(decorated.fxHint).toBe('sparkle-green');
    expect(decorated.type).toBe('MoodChanged');
    expect(decorated.at).toBe(1);
    expect(decorated.agentId).toBe('a1');
    // Original event is not mutated.
    expect(event.fxHint).toBeUndefined();
  });

  it('withFxHint overrides an existing fxHint', () => {
    const event: DomainEvent = { type: 'Zap', at: 0, fxHint: 'old' };
    const decorated = withFxHint(event, 'new');
    expect(decorated.fxHint).toBe('new');
    expect(event.fxHint).toBe('old');
  });

  it('getFxHint returns the current hint or undefined', () => {
    const plain: DomainEvent = { type: 'Plain', at: 0 };
    const hinted: DomainEvent = { type: 'Hinted', at: 0, fxHint: 'sad-cloud' };
    expect(getFxHint(plain)).toBeUndefined();
    expect(getFxHint(hinted)).toBe('sad-cloud');
  });

  it('preserves the narrow event subtype on the return value', () => {
    interface SpecificEvent extends DomainEvent {
      type: 'Specific';
      payload: { foo: string };
    }
    const event: SpecificEvent = { type: 'Specific', at: 0, payload: { foo: 'bar' } };
    const decorated = withFxHint(event, 'pop');
    // TypeScript-level: decorated is still SpecificEvent. Runtime checks:
    expect(decorated.type).toBe('Specific');
    expect(decorated.payload.foo).toBe('bar');
    expect(decorated.fxHint).toBe('pop');
  });
});
