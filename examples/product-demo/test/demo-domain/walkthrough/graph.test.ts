import { describe, expect, it } from 'vitest';

import {
  ALWAYS,
  NEVER,
  combineAll,
  tickAtLeast,
} from '../../../src/demo-domain/walkthrough/predicates.js';
import {
  WalkthroughGraphError,
  defineWalkthroughGraph,
  getChapterSteps,
  getNextStep,
  getSkipTarget,
  getStepById,
} from '../../../src/demo-domain/walkthrough/graph.js';
import {
  TOUR_END,
  selectorHandle,
  walkthroughStepId,
} from '../../../src/demo-domain/walkthrough/types.js';
import type {
  AgentSessionSnapshot,
  RouteContext,
  TourCtx,
  WalkthroughStep,
} from '../../../src/demo-domain/walkthrough/types.js';

function step(
  id: string,
  chapter: 1 | 2 | 3 | 4 | 5,
  next: string | typeof TOUR_END,
  predicate = ALWAYS,
): WalkthroughStep {
  return {
    id: walkthroughStepId(id),
    chapter,
    title: `Step ${id}`,
    hint: `Hint ${id}`,
    highlight: selectorHandle(`handle:${id}`),
    completionPredicate: predicate,
    nextOnComplete: next === TOUR_END ? TOUR_END : walkthroughStepId(next),
  };
}

function makeCtx(overrides: { tickIndex?: number; path?: string } = {}): TourCtx {
  const session: AgentSessionSnapshot = {
    tickIndex: overrides.tickIndex ?? 0,
    cognitionModeId: 'urgency',
    seed: 42,
    recentEvents: [],
  };
  const route: RouteContext = {
    path: overrides.path ?? '/',
    scenarioId: null,
    tourStep: null,
  };
  return { session, route };
}

describe('defineWalkthroughGraph', () => {
  it('throws on an empty step list', () => {
    expect(() => defineWalkthroughGraph([])).toThrow(WalkthroughGraphError);
  });

  it('throws on duplicate step ids', () => {
    const dup = [step('a', 1, TOUR_END), step('a', 1, TOUR_END)];
    expect(() => defineWalkthroughGraph(dup)).toThrow(/duplicate walkthrough step id: a/);
  });

  it('throws when nextOnComplete references an unknown id', () => {
    const broken = [step('a', 1, 'b')];
    expect(() => defineWalkthroughGraph(broken)).toThrow(/step "a" advances to unknown step "b"/);
  });

  it('returns a frozen graph with stepsById + chapter buckets', () => {
    const graph = defineWalkthroughGraph([
      step('1.start', 1, '1.observe'),
      step('1.observe', 1, '2.start'),
      step('2.start', 2, TOUR_END),
    ]);

    expect(graph.steps).toHaveLength(3);
    expect(Object.isFrozen(graph)).toBe(true);
    expect(graph.firstStepId).toBe(walkthroughStepId('1.start'));
    expect(graph.stepsById.get(walkthroughStepId('1.observe'))?.title).toBe('Step 1.observe');
    expect(getChapterSteps(graph, 1)).toHaveLength(2);
    expect(getChapterSteps(graph, 2)).toHaveLength(1);
    expect(getChapterSteps(graph, 5)).toHaveLength(0);
  });

  it('preserves declaration order inside each chapter', () => {
    const graph = defineWalkthroughGraph([
      step('1.first', 1, '1.second'),
      step('1.second', 1, TOUR_END),
    ]);
    const chapter1 = getChapterSteps(graph, 1);
    expect(chapter1.map((s) => String(s.id))).toEqual(['1.first', '1.second']);
  });
});

describe('getStepById', () => {
  it('returns a known step', () => {
    const graph = defineWalkthroughGraph([step('a', 1, TOUR_END)]);
    expect(getStepById(graph, walkthroughStepId('a'))?.title).toBe('Step a');
  });

  it('returns undefined for an unknown id', () => {
    const graph = defineWalkthroughGraph([step('a', 1, TOUR_END)]);
    expect(getStepById(graph, walkthroughStepId('missing'))).toBeUndefined();
  });
});

describe('getNextStep', () => {
  it('returns undefined when the current predicate is not satisfied', () => {
    const graph = defineWalkthroughGraph([
      step('a', 1, 'b', tickAtLeast(5)),
      step('b', 1, TOUR_END),
    ]);
    expect(getNextStep(graph, walkthroughStepId('a'), makeCtx({ tickIndex: 4 }))).toBeUndefined();
  });

  it('returns the next step when the predicate is satisfied', () => {
    const graph = defineWalkthroughGraph([
      step('a', 1, 'b', tickAtLeast(5)),
      step('b', 1, TOUR_END),
    ]);
    const next = getNextStep(graph, walkthroughStepId('a'), makeCtx({ tickIndex: 5 }));
    expect(next).not.toBeUndefined();
    expect(next === TOUR_END ? null : next?.id).toBe(walkthroughStepId('b'));
  });

  it('returns TOUR_END when the final step is satisfied', () => {
    const graph = defineWalkthroughGraph([step('only', 1, TOUR_END)]);
    expect(getNextStep(graph, walkthroughStepId('only'), makeCtx())).toBe(TOUR_END);
  });

  it('combineAll predicates compose for multi-condition advance', () => {
    const graph = defineWalkthroughGraph([
      step('a', 1, 'b', combineAll(tickAtLeast(5))),
      step('b', 1, TOUR_END),
    ]);
    expect(getNextStep(graph, walkthroughStepId('a'), makeCtx({ tickIndex: 5 }))).toBeDefined();
  });

  it('throws when called with an unknown current id', () => {
    const graph = defineWalkthroughGraph([step('a', 1, TOUR_END)]);
    expect(() => getNextStep(graph, walkthroughStepId('missing'), makeCtx())).toThrow(
      /unknown current step id: missing/,
    );
  });

  it('NEVER predicate keeps the cursor in place forever', () => {
    const graph = defineWalkthroughGraph([step('a', 1, 'b', NEVER), step('b', 1, TOUR_END)]);
    expect(
      getNextStep(graph, walkthroughStepId('a'), makeCtx({ tickIndex: 1_000_000 })),
    ).toBeUndefined();
  });
});

describe('getSkipTarget', () => {
  it('advances even when the predicate would keep the cursor in place', () => {
    const graph = defineWalkthroughGraph([step('a', 1, 'b', NEVER), step('b', 1, TOUR_END)]);
    const next = getSkipTarget(graph, walkthroughStepId('a'));
    expect(next === TOUR_END ? null : next.id).toBe(walkthroughStepId('b'));
  });

  it('returns TOUR_END when skipping the final step', () => {
    const graph = defineWalkthroughGraph([step('only', 1, TOUR_END)]);
    expect(getSkipTarget(graph, walkthroughStepId('only'))).toBe(TOUR_END);
  });

  it('throws when called with an unknown current id', () => {
    const graph = defineWalkthroughGraph([step('a', 1, TOUR_END)]);
    expect(() => getSkipTarget(graph, walkthroughStepId('missing'))).toThrow(
      /unknown current step id: missing/,
    );
  });
});
