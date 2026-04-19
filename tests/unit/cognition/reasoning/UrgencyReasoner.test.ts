import { describe, expect, it } from 'vitest';
import type { IntentionCandidate } from '../../../../src/cognition/IntentionCandidate.js';
import type { ReasonerContext } from '../../../../src/cognition/reasoning/Reasoner.js';
import { UrgencyReasoner } from '../../../../src/cognition/reasoning/UrgencyReasoner.js';
import { Modifiers } from '../../../../src/modifiers/Modifiers.js';

function ctx(candidates: readonly IntentionCandidate[]): ReasonerContext {
  return {
    perceived: [],
    needs: undefined,
    modifiers: new Modifiers(),
    candidates,
  };
}

describe('UrgencyReasoner.selectIntention — R-28 coverage', () => {
  it('returns null for an empty candidate list', () => {
    const r = new UrgencyReasoner();
    expect(r.selectIntention(ctx([]))).toBeNull();
  });

  it('returns null when the only candidate scores below the threshold', () => {
    const r = new UrgencyReasoner({ threshold: 1 });
    const pick = r.selectIntention(
      ctx([{ intention: { kind: 'satisfy', type: 'eat' }, score: 0.5, source: 'needs' }]),
    );
    expect(pick).toBeNull();
  });

  it('picks the highest-scoring candidate', () => {
    const r = new UrgencyReasoner();
    const pick = r.selectIntention(
      ctx([
        { intention: { kind: 'satisfy', type: 'eat' }, score: 0.3, source: 'needs' },
        { intention: { kind: 'satisfy', type: 'sleep' }, score: 0.9, source: 'needs' },
        { intention: { kind: 'express', type: 'meow' }, score: 0.1, source: 'needs' },
      ]),
    );
    expect(pick?.type).toBe('sleep');
  });

  it('ties: first candidate wins because strict > is used', () => {
    const r = new UrgencyReasoner();
    const pick = r.selectIntention(
      ctx([
        { intention: { kind: 'satisfy', type: 'eat' }, score: 0.5, source: 'needs' },
        { intention: { kind: 'satisfy', type: 'sleep' }, score: 0.5, source: 'needs' },
      ]),
    );
    expect(pick?.type).toBe('eat');
  });

  it('modifier bonus can swing the pick', () => {
    const r = new UrgencyReasoner();
    const mods = new Modifiers();
    mods.apply({
      id: 'crave-sleep',
      source: 'test',
      appliedAt: 0,
      stack: 'replace',
      effects: [
        { target: { type: 'intention-score', intentionType: 'sleep' }, kind: 'add', value: 1 },
      ],
    });
    const pick = r.selectIntention({
      perceived: [],
      needs: undefined,
      modifiers: mods,
      candidates: [
        { intention: { kind: 'satisfy', type: 'eat' }, score: 0.6, source: 'needs' },
        { intention: { kind: 'satisfy', type: 'sleep' }, score: 0.3, source: 'needs' },
      ],
    });
    // Without the modifier, 'eat' (0.6) wins. With +1 on 'sleep' (0.3+1=1.3), sleep wins.
    expect(pick?.type).toBe('sleep');
  });

  it('persona bias is applied multiplicatively to the baseline score', () => {
    const r = new UrgencyReasoner({
      personaBias: (type) => (type === 'play' ? 1 : 0),
    });
    const pick = r.selectIntention({
      perceived: [],
      needs: undefined,
      modifiers: new Modifiers(),
      persona: { traits: { playfulness: 1 } },
      candidates: [
        { intention: { kind: 'satisfy', type: 'eat' }, score: 0.5, source: 'needs' },
        { intention: { kind: 'satisfy', type: 'play' }, score: 0.3, source: 'needs' },
      ],
    });
    // eat: 0.5 * (1+0) = 0.5. play: 0.3 * (1+1) = 0.6. play wins.
    expect(pick?.type).toBe('play');
  });

  it('custom threshold filters out low-score candidates', () => {
    const r = new UrgencyReasoner({ threshold: 0.5 });
    const pick = r.selectIntention(
      ctx([
        { intention: { kind: 'satisfy', type: 'a' }, score: 0.4, source: 'needs' },
        { intention: { kind: 'satisfy', type: 'b' }, score: 0.6, source: 'needs' },
      ]),
    );
    expect(pick?.type).toBe('b');
  });
});
