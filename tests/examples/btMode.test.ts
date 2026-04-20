import { describe, expect, it } from 'vitest';
import { btMode } from '../../examples/nurture-pet/src/cognition/bt.js';
import type { DomainEvent } from '../../src/events/DomainEvent.js';
import type { Intention } from '../../src/cognition/Intention.js';
import type { IntentionCandidate } from '../../src/cognition/IntentionCandidate.js';
import type { Reasoner, ReasonerContext } from '../../src/cognition/reasoning/Reasoner.js';
import { Modifiers } from '../../src/modifiers/Modifiers.js';

const HUNGER_CANDIDATE: IntentionCandidate = {
  intention: { kind: 'satisfy', type: 'satisfy-need:hunger' },
  score: 0.9,
  source: 'needs',
};

const TREAT_EVENT: DomainEvent = {
  type: 'RandomEvent',
  subtype: 'surpriseTreat',
  at: 0,
};

function ctx(perceived: readonly DomainEvent[]): ReasonerContext {
  return {
    perceived,
    needs: undefined,
    modifiers: new Modifiers(),
    candidates: [HUNGER_CANDIDATE],
  };
}

function tick(reasoner: Reasoner, perceived: readonly DomainEvent[]): Intention | null {
  return reasoner.selectIntention(ctx(perceived));
}

describe('btMode (cognition switcher BT)', () => {
  it('locks in approach-treat for exactly 3 ticks after a surpriseTreat', async () => {
    const reasoner = await btMode.construct();

    // Tick 1: treat arrives → BT switches to approach-treat.
    expect(tick(reasoner, [TREAT_EVENT])?.type).toBe('approach-treat');

    // Ticks 2 + 3: no treat, but the interrupt window stays active.
    expect(tick(reasoner, [])?.type).toBe('approach-treat');
    expect(tick(reasoner, [])?.type).toBe('approach-treat');

    // Tick 4: window has elapsed → fall back to the urgency top candidate.
    // This is the regression guard for the RUNNING→SUCCEEDED fix: returning
    // RUNNING from RunApproachTreat would pin the action node and never
    // re-evaluate the IsReactingToTreat condition, so the BT would keep
    // committing approach-treat indefinitely.
    expect(tick(reasoner, [])?.type).toBe('satisfy-need:hunger');
  });

  it('refreshes the interrupt window when a second surpriseTreat arrives', async () => {
    const reasoner = await btMode.construct();

    expect(tick(reasoner, [TREAT_EVENT])?.type).toBe('approach-treat');
    // Second treat during the window resets the counter back to 3.
    expect(tick(reasoner, [TREAT_EVENT])?.type).toBe('approach-treat');
    expect(tick(reasoner, [])?.type).toBe('approach-treat');
    expect(tick(reasoner, [])?.type).toBe('approach-treat');
    expect(tick(reasoner, [])?.type).toBe('satisfy-need:hunger');
  });

  it('falls back to the top candidate when no treat has been perceived', async () => {
    const reasoner = await btMode.construct();
    expect(tick(reasoner, [])?.type).toBe('satisfy-need:hunger');
    expect(tick(reasoner, [])?.type).toBe('satisfy-need:hunger');
  });
});
