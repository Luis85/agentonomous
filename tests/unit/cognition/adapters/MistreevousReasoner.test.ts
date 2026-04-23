import { describe, expect, it } from 'vitest';
import {
  MistreevousReasoner,
  MistreevousState,
} from '../../../../src/cognition/adapters/mistreevous/index.js';
import type { IntentionCandidate } from '../../../../src/cognition/IntentionCandidate.js';
import type { ReasonerContext } from '../../../../src/cognition/reasoning/Reasoner.js';
import { Modifiers } from '../../../../src/modifiers/Modifiers.js';
import { SeededRng } from '../../../../src/ports/SeededRng.js';

type NeedsLike = { getLevel(id: string): number };

function ctx(
  candidates: readonly IntentionCandidate[],
  needs?: Record<string, number>,
): ReasonerContext {
  const needsLike: NeedsLike | undefined = needs
    ? { getLevel: (id: string) => needs[id] ?? 1 }
    : undefined;
  return {
    perceived: [],
    needs: needsLike as unknown as ReasonerContext['needs'],
    modifiers: new Modifiers(),
    candidates,
  };
}

function readNeed(c: ReasonerContext, id: string): number {
  const needs = c.needs as unknown as NeedsLike | undefined;
  return needs?.getLevel(id) ?? 1;
}

describe('MistreevousReasoner', () => {
  it('returns null when no handler commits an intention', () => {
    const reasoner = new MistreevousReasoner({
      definition: 'root { action [doNothing] }',
      handlers: {
        // Action handler returning void → SUCCEEDED.
        doNothing: () => {},
      },
    });
    expect(reasoner.selectIntention(ctx([]))).toBeNull();
  });

  it('commits the intention chosen by an action handler', () => {
    const reasoner = new MistreevousReasoner({
      definition: 'root { action [pickEat] }',
      handlers: {
        pickEat: (_ctx, helpers) => {
          helpers.commit({ kind: 'satisfy', type: 'eat' });
        },
      },
    });
    const pick = reasoner.selectIntention(
      ctx([{ intention: { kind: 'satisfy', type: 'eat' }, score: 0.9, source: 'needs' }]),
    );
    expect(pick).toEqual({ kind: 'satisfy', type: 'eat' });
  });

  it('routes a sequence of condition + action handlers and reads ctx.candidates', () => {
    const reasoner = new MistreevousReasoner({
      definition: `
        root {
          selector {
            sequence {
              condition [hungerCritical]
              action [commitTopHungerCandidate]
            }
            action [commitIdle]
          }
        }
      `,
      handlers: {
        // Condition: returns boolean.
        hungerCritical: (c) => readNeed(c, 'hunger') < 0.3,
        commitTopHungerCandidate: (_c, helpers) => {
          const top = helpers.topCandidate((cand) => cand.intention.type === 'satisfy-need:hunger');
          if (!top) return MistreevousState.FAILED;
          helpers.commit(top.intention);
          return MistreevousState.SUCCEEDED;
        },
        commitIdle: (_c, helpers) => {
          helpers.commit({ kind: 'idle', type: 'idle' });
        },
      },
    });

    const candidates: IntentionCandidate[] = [
      {
        intention: { kind: 'satisfy', type: 'satisfy-need:hunger' },
        score: 0.8,
        source: 'needs',
      },
      {
        intention: { kind: 'satisfy', type: 'satisfy-need:energy' },
        score: 0.4,
        source: 'needs',
      },
    ];

    // hunger=0.1 is critical → BT picks the hunger candidate.
    expect(reasoner.selectIntention(ctx(candidates, { hunger: 0.1 }))).toEqual({
      kind: 'satisfy',
      type: 'satisfy-need:hunger',
    });

    // hunger=0.9 is fine → BT falls through to the idle action.
    expect(reasoner.selectIntention(ctx(candidates, { hunger: 0.9 }))).toEqual({
      kind: 'idle',
      type: 'idle',
    });
  });

  it('respects RUNNING return values across ticks (BT state continuity)', () => {
    let stepsRemaining = 2;
    const reasoner = new MistreevousReasoner({
      definition: 'root { action [longRunning] }',
      handlers: {
        longRunning: (_c, helpers) => {
          if (stepsRemaining > 0) {
            stepsRemaining -= 1;
            return MistreevousState.RUNNING;
          }
          helpers.commit({ kind: 'satisfy', type: 'finally-done' });
          return MistreevousState.SUCCEEDED;
        },
      },
    });

    expect(reasoner.selectIntention(ctx([]))).toBeNull();
    expect(reasoner.selectIntention(ctx([]))).toBeNull();
    expect(reasoner.selectIntention(ctx([]))).toEqual({
      kind: 'satisfy',
      type: 'finally-done',
    });
  });

  it('routes a seeded random source through to mistreevous lotto nodes deterministically', () => {
    function makeReasoner(seed: string): MistreevousReasoner {
      const rng = new SeededRng(seed);
      return new MistreevousReasoner({
        definition: `
          root {
            lotto {
              action [commitA]
              action [commitB]
              action [commitC]
            }
          }
        `,
        random: () => rng.next(),
        handlers: {
          commitA: (_c, h) => {
            h.commit({ kind: 'express', type: 'A' });
          },
          commitB: (_c, h) => {
            h.commit({ kind: 'express', type: 'B' });
          },
          commitC: (_c, h) => {
            h.commit({ kind: 'express', type: 'C' });
          },
        },
      });
    }

    const a = makeReasoner('lotto-seed');
    const b = makeReasoner('lotto-seed');

    const aPicks: string[] = [];
    const bPicks: string[] = [];
    for (let i = 0; i < 10; i++) {
      aPicks.push(a.selectIntention(ctx([]))?.type ?? '?');
      bPicks.push(b.selectIntention(ctx([]))?.type ?? '?');
    }

    expect(aPicks).toEqual(bPicks);
  });

  it('reset() returns the tree to READY', () => {
    const reasoner = new MistreevousReasoner({
      definition: 'root { action [commitOnce] }',
      handlers: {
        commitOnce: (_c, h) => {
          h.commit({ kind: 'satisfy', type: 'committed' });
        },
      },
    });
    reasoner.selectIntention(ctx([]));
    reasoner.reset();
    expect(reasoner.getTreeState()).toBe(MistreevousState.READY);
  });

  describe('reset()', () => {
    it('clears a RUNNING node back to READY — port contract', () => {
      // Mirrors the RUNNING-continuity fixture: a long-running handler
      // that would otherwise stay RUNNING across multiple selectIntention
      // ticks. reset() must wipe that mid-sequence state.
      let stepsRemaining = 5;
      const reasoner = new MistreevousReasoner({
        definition: 'root { action [longRunning] }',
        handlers: {
          longRunning: (_c, helpers) => {
            if (stepsRemaining > 0) {
              stepsRemaining -= 1;
              return MistreevousState.RUNNING;
            }
            helpers.commit({ kind: 'satisfy', type: 'finally-done' });
            return MistreevousState.SUCCEEDED;
          },
        },
      });

      // One tick — tree enters RUNNING and the handler consumed one step.
      reasoner.selectIntention(ctx([]));
      expect(reasoner.getTreeState()).toBe(MistreevousState.RUNNING);

      reasoner.reset();
      expect(reasoner.getTreeState()).toBe(MistreevousState.READY);
    });
  });
});
