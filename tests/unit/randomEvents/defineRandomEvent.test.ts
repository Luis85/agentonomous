import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../../src/events/DomainEvent.js';
import { Modifiers } from '../../../src/modifiers/Modifiers.js';
import { SeededRng } from '../../../src/ports/SeededRng.js';
import {
  defineRandomEvent,
  type RandomEventContext,
} from '../../../src/randomEvents/defineRandomEvent.js';

describe('defineRandomEvent', () => {
  it('returns its input unchanged (passthrough)', () => {
    const def = defineRandomEvent({
      id: 'meteor',
      probabilityPerSecond: 0.1,
      emit: () => ({ type: 'Meteor', at: 0 }),
    });

    expect(def.id).toBe('meteor');
    expect(def.probabilityPerSecond).toBe(0.1);
    expect(def.guard).toBeUndefined();
    expect(def.cooldownSeconds).toBeUndefined();
    // Emit is callable; exercise it rather than poking at its function-ness.
    const rng = new SeededRng('unit');
    expect(
      def.emit({ needs: undefined, modifiers: new Modifiers(), stage: undefined, rng }).type,
    ).toBe('Meteor');
  });

  it('preserves optional fields on the descriptor', () => {
    const def = defineRandomEvent({
      id: 'shooting-star',
      probabilityPerSecond: 0.25,
      cooldownSeconds: 30,
      guard: () => true,
      emit: () => ({ type: 'ShootingStar', at: 0 }),
    });

    expect(def.cooldownSeconds).toBe(30);
    const ctx = {
      needs: undefined,
      modifiers: new Modifiers(),
      stage: undefined,
      rng: new SeededRng('unit'),
    };
    expect(def.guard?.(ctx)).toBe(true);
  });

  it('the emitted descriptor wires context into emit/guard as documented', () => {
    const ctx: RandomEventContext = {
      needs: undefined,
      modifiers: new Modifiers(),
      stage: 'adult',
      rng: new SeededRng('unit'),
    };
    const seen: RandomEventContext[] = [];
    const def = defineRandomEvent({
      id: 'ping',
      probabilityPerSecond: 1,
      guard(received) {
        seen.push(received);
        return true;
      },
      emit(received): DomainEvent {
        seen.push(received);
        return { type: 'Ping', at: 0 };
      },
    });

    expect(def.guard?.(ctx)).toBe(true);
    expect(def.emit(ctx).type).toBe('Ping');
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(ctx);
    expect(seen[1]).toBe(ctx);
  });
});
