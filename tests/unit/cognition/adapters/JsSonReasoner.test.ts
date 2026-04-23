import { describe, expect, it } from 'vitest';
import {
  Belief,
  Desire,
  JsSonReasoner,
  Plan,
} from '../../../../src/cognition/adapters/js-son/index.js';
import type { IntentionCandidate } from '../../../../src/cognition/IntentionCandidate.js';
import type { ReasonerContext } from '../../../../src/cognition/reasoning/Reasoner.js';
import { Modifiers } from '../../../../src/modifiers/Modifiers.js';

type NeedsLike = { list(): readonly { id: string; level: number }[] };

function ctx(
  candidates: readonly IntentionCandidate[],
  needs?: Record<string, number>,
): ReasonerContext {
  const needsLike: NeedsLike | undefined = needs
    ? {
        list: () => Object.entries(needs).map(([id, level]) => ({ id, level })),
      }
    : undefined;
  return {
    perceived: [],
    needs: needsLike as unknown as ReasonerContext['needs'],
    modifiers: new Modifiers(),
    candidates,
  };
}

describe('JsSonReasoner', () => {
  it('returns null when no plan commits an intention', () => {
    const reasoner = new JsSonReasoner({
      beliefs: { ...Belief('alive', true) },
      plans: [
        Plan(
          () => true,
          () => [{ log: 'noop' }],
        ),
      ],
    });
    expect(reasoner.selectIntention(ctx([]))).toBeNull();
  });

  it('commits the intention returned by a plan body', () => {
    const reasoner = new JsSonReasoner({
      beliefs: { ...Belief('alive', true) },
      plans: [
        Plan(
          () => true,
          () => [{ intention: { kind: 'satisfy', type: 'eat' } }],
        ),
      ],
    });
    expect(reasoner.selectIntention(ctx([]))).toEqual({ kind: 'satisfy', type: 'eat' });
  });

  it('routes on beliefs derived from ctx.needs via the default mapper', () => {
    type NeedsBeliefs = { needs?: Record<string, number> };
    const reasoner = new JsSonReasoner({
      beliefs: { ...Belief('needs', {}) },
      plans: [
        Plan(
          (intentions) => ((intentions as NeedsBeliefs).needs?.['hunger'] ?? 1) >= 0.3,
          () => [{ intention: { kind: 'idle', type: 'idle' } }],
        ),
        Plan(
          (intentions) => ((intentions as NeedsBeliefs).needs?.['hunger'] ?? 1) < 0.3,
          () => [{ intention: { kind: 'satisfy', type: 'satisfy-need:hunger' } }],
        ),
      ],
    });

    expect(reasoner.selectIntention(ctx([], { hunger: 0.1 }))).toEqual({
      kind: 'satisfy',
      type: 'satisfy-need:hunger',
    });

    expect(reasoner.selectIntention(ctx([], { hunger: 0.9 }))).toEqual({
      kind: 'idle',
      type: 'idle',
    });
  });

  it('routes desires → intentions: only fires the plan when the desire holds', () => {
    type UrgentIntentions = { urgent?: boolean };
    const reasoner = new JsSonReasoner({
      beliefs: { ...Belief('alive', true) },
      desires: {
        ...Desire(
          'urgent',
          (beliefs) =>
            ((beliefs as { needs?: Record<string, number> }).needs?.['hunger'] ?? 1) < 0.5,
        ),
      },
      plans: [
        Plan(
          (intentions) => (intentions as UrgentIntentions).urgent === true,
          () => [{ intention: { kind: 'satisfy', type: 'satisfy-need:hunger' } }],
        ),
      ],
    });

    expect(reasoner.selectIntention(ctx([], { hunger: 0.1 }))).toEqual({
      kind: 'satisfy',
      type: 'satisfy-need:hunger',
    });

    expect(reasoner.selectIntention(ctx([], { hunger: 0.9 }))).toBeNull();
  });

  it('exposes topCandidate as a belief so no-desire plans can pick from candidates', () => {
    type TopCandidateFn = (
      filter?: (c: IntentionCandidate) => boolean,
    ) => IntentionCandidate | null;
    type PlanBeliefs = {
      topCandidate: TopCandidateFn;
      needs?: Record<string, number>;
    };

    const candidates: IntentionCandidate[] = [
      { intention: { kind: 'satisfy', type: 'satisfy-need:hunger' }, score: 0.8, source: 'needs' },
      { intention: { kind: 'satisfy', type: 'satisfy-need:energy' }, score: 0.4, source: 'needs' },
    ];

    const reasoner = new JsSonReasoner({
      beliefs: { ...Belief('candidates', []) },
      plans: [
        Plan(
          (intentions) => ((intentions as PlanBeliefs).needs?.['hunger'] ?? 1) < 0.5,
          (intentions) => {
            const top = (intentions as PlanBeliefs).topCandidate(
              (c) => c.intention.type === 'satisfy-need:hunger',
            );
            return top ? [{ intention: top.intention }] : [];
          },
        ),
      ],
    });

    expect(reasoner.selectIntention(ctx(candidates, { hunger: 0.1 }))).toEqual({
      kind: 'satisfy',
      type: 'satisfy-need:hunger',
    });

    expect(reasoner.selectIntention(ctx(candidates, { hunger: 0.9 }))).toBeNull();
  });

  it('honours a custom toBeliefs mapper', () => {
    type PerceivedCountBeliefs = { perceivedCount: number };
    const reasoner = new JsSonReasoner({
      beliefs: { perceivedCount: 0 },
      toBeliefs: (c) => ({ perceivedCount: c.perceived.length + c.candidates.length }),
      plans: [
        Plan(
          (intentions) => (intentions as PerceivedCountBeliefs).perceivedCount > 0,
          (intentions) => [
            { intention: { kind: 'react', type: 'observe', params: { seen: intentions } } },
          ],
        ),
      ],
    });

    expect(reasoner.selectIntention(ctx([]))).toBeNull();
    const observed = reasoner.selectIntention(
      ctx([{ intention: { kind: 'satisfy', type: 'eat' }, score: 0.5, source: 'needs' }]),
    );
    expect(observed?.kind).toBe('react');
    expect(observed?.type).toBe('observe');
  });

  it('uses the last committed intention when multiple plans fire', () => {
    const reasoner = new JsSonReasoner({
      beliefs: { ...Belief('alive', true) },
      plans: [
        Plan(
          () => true,
          () => [{ intention: { kind: 'express', type: 'first' } }],
        ),
        Plan(
          () => true,
          () => [{ intention: { kind: 'express', type: 'second' } }],
        ),
      ],
    });
    expect(reasoner.selectIntention(ctx([]))).toEqual({ kind: 'express', type: 'second' });
  });

  it('reset() rebuilds the agent so beliefs do not accumulate across ticks', () => {
    const reasoner = new JsSonReasoner({
      beliefs: { counter: 0 },
      plans: [
        Plan(
          () => true,
          () => [{ log: 'seen' }],
        ),
      ],
    });
    reasoner.selectIntention(ctx([], { hunger: 0.5 }));
    const dirty = reasoner.getBeliefs();
    expect(dirty['needs']).toBeDefined();
    reasoner.reset();
    const fresh = reasoner.getBeliefs();
    expect(fresh['needs']).toBeUndefined();
    expect(fresh['counter']).toBe(0);
  });

  describe('reset()', () => {
    it('restores beliefs to the initial map exactly — port contract', () => {
      const initial = { alive: true, mood: 'neutral', ticks: 0 };
      const reasoner = new JsSonReasoner({
        beliefs: { ...initial },
        plans: [
          Plan(
            () => true,
            () => [{ log: 'observed' }],
          ),
        ],
      });

      // Tick once — the default toBeliefs mapper injects needs/modifiers/etc.
      // into the belief map, so the post-tick beliefs differ from initial.
      reasoner.selectIntention(ctx([], { hunger: 0.5 }));
      expect(reasoner.getBeliefs()).not.toEqual(initial);

      reasoner.reset();
      expect(reasoner.getBeliefs()).toEqual(initial);
    });
  });
});
