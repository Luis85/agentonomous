import { describe, expect, it } from 'vitest';

import {
  ALWAYS,
  NEVER,
  cognitionModeIs,
  combineAll,
  combineAny,
  eventEmittedSince,
  eventEmittedSinceStep,
  not,
  onRoute,
  onRoutePrefix,
  tickAtLeast,
  ticksSinceStepAtLeast,
} from '../../../src/demo-domain/walkthrough/predicates.js';
import type {
  AgentSessionSnapshot,
  RouteContext,
  TourCtx,
} from '../../../src/demo-domain/walkthrough/types.js';
import { walkthroughStepId } from '../../../src/demo-domain/walkthrough/types.js';

function makeCtx(overrides: {
  session?: Partial<AgentSessionSnapshot>;
  route?: Partial<RouteContext>;
  stepBaselineTick?: number;
}): TourCtx {
  const session: AgentSessionSnapshot = {
    tickIndex: overrides.session?.tickIndex ?? 0,
    cognitionModeId: overrides.session?.cognitionModeId ?? 'urgency',
    seed: overrides.session?.seed ?? 1,
    recentEvents: overrides.session?.recentEvents ?? [],
  };
  const route: RouteContext = {
    path: overrides.route?.path ?? '/',
    scenarioId: overrides.route?.scenarioId ?? null,
    tourStep: overrides.route?.tourStep ?? null,
  };
  return { session, route, stepBaselineTick: overrides.stepBaselineTick ?? 0 };
}

describe('walkthrough predicates', () => {
  describe('ALWAYS / NEVER', () => {
    it('ALWAYS returns true regardless of context', () => {
      expect(ALWAYS(makeCtx({}))).toBe(true);
    });

    it('NEVER returns false regardless of context', () => {
      expect(NEVER(makeCtx({}))).toBe(false);
    });
  });

  describe('onRoute', () => {
    it('matches an exact path', () => {
      const p = onRoute('/play/pet-care');
      expect(p(makeCtx({ route: { path: '/play/pet-care' } }))).toBe(true);
    });

    it('rejects a non-matching path', () => {
      const p = onRoute('/play/pet-care');
      expect(p(makeCtx({ route: { path: '/play/companion-npc' } }))).toBe(false);
    });

    it('does not match a prefix only', () => {
      const p = onRoute('/play');
      expect(p(makeCtx({ route: { path: '/play/pet-care' } }))).toBe(false);
    });
  });

  describe('onRoutePrefix', () => {
    it('matches a path starting with the prefix', () => {
      const p = onRoutePrefix('/play/');
      expect(p(makeCtx({ route: { path: '/play/pet-care' } }))).toBe(true);
    });

    it('rejects a path that does not start with the prefix', () => {
      const p = onRoutePrefix('/play/');
      expect(p(makeCtx({ route: { path: '/tour/1' } }))).toBe(false);
    });
  });

  describe('tickAtLeast', () => {
    it('is true when tickIndex equals threshold', () => {
      expect(tickAtLeast(10)(makeCtx({ session: { tickIndex: 10 } }))).toBe(true);
    });

    it('is true when tickIndex exceeds threshold', () => {
      expect(tickAtLeast(10)(makeCtx({ session: { tickIndex: 11 } }))).toBe(true);
    });

    it('is false when tickIndex is below threshold', () => {
      expect(tickAtLeast(10)(makeCtx({ session: { tickIndex: 9 } }))).toBe(false);
    });
  });

  describe('cognitionModeIs', () => {
    it('matches the active mode id exactly', () => {
      expect(cognitionModeIs('urgency')(makeCtx({ session: { cognitionModeId: 'urgency' } }))).toBe(
        true,
      );
    });

    it('rejects a different mode id', () => {
      expect(cognitionModeIs('urgency')(makeCtx({ session: { cognitionModeId: 'bdi' } }))).toBe(
        false,
      );
    });
  });

  describe('eventEmittedSince', () => {
    it('matches an event of the right type at or after the threshold', () => {
      const ctx = makeCtx({
        session: {
          recentEvents: [
            { type: 'AGENT_TICKED', tickIndex: 3 },
            { type: 'COGNITION_SWITCHED', tickIndex: 7 },
          ],
        },
      });
      expect(eventEmittedSince('COGNITION_SWITCHED', 5)(ctx)).toBe(true);
    });

    it('ignores matching events before the threshold', () => {
      const ctx = makeCtx({
        session: {
          recentEvents: [{ type: 'COGNITION_SWITCHED', tickIndex: 3 }],
        },
      });
      expect(eventEmittedSince('COGNITION_SWITCHED', 5)(ctx)).toBe(false);
    });

    it('ignores events of the wrong type', () => {
      const ctx = makeCtx({
        session: {
          recentEvents: [{ type: 'AGENT_TICKED', tickIndex: 9 }],
        },
      });
      expect(eventEmittedSince('COGNITION_SWITCHED', 0)(ctx)).toBe(false);
    });

    it('with sinceTick=0 matches any tick', () => {
      const ctx = makeCtx({
        session: {
          recentEvents: [{ type: 'PREVIEW_APPLIED', tickIndex: 0 }],
        },
      });
      expect(eventEmittedSince('PREVIEW_APPLIED', 0)(ctx)).toBe(true);
    });
  });

  describe('eventEmittedSinceStep', () => {
    it('is true when the event tick is at or after stepBaselineTick', () => {
      const p = eventEmittedSinceStep('SNAPSHOT_EXPORTED');
      const ctx = makeCtx({
        stepBaselineTick: 10,
        session: {
          tickIndex: 12,
          recentEvents: [{ type: 'SNAPSHOT_EXPORTED', tickIndex: 11 }],
        },
      });
      expect(p(ctx)).toBe(true);
    });

    it('is false when the only matching event was emitted before the step started', () => {
      const p = eventEmittedSinceStep('SNAPSHOT_EXPORTED');
      const ctx = makeCtx({
        stepBaselineTick: 10,
        session: {
          tickIndex: 12,
          recentEvents: [{ type: 'SNAPSHOT_EXPORTED', tickIndex: 5 }],
        },
      });
      expect(p(ctx)).toBe(false);
    });

    it('is false when no matching event has been seen', () => {
      const p = eventEmittedSinceStep('SNAPSHOT_EXPORTED');
      const ctx = makeCtx({
        stepBaselineTick: 0,
        session: { tickIndex: 5, recentEvents: [{ type: 'AGENT_TICKED', tickIndex: 1 }] },
      });
      expect(p(ctx)).toBe(false);
    });
  });

  describe('ticksSinceStepAtLeast', () => {
    it('is true once the elapsed-since-baseline ticks meet the threshold', () => {
      const p = ticksSinceStepAtLeast(3);
      expect(p(makeCtx({ stepBaselineTick: 10, session: { tickIndex: 13 } }))).toBe(true);
      expect(p(makeCtx({ stepBaselineTick: 10, session: { tickIndex: 14 } }))).toBe(true);
    });

    it('is false when fewer than n ticks have elapsed since the step started', () => {
      const p = ticksSinceStepAtLeast(3);
      expect(p(makeCtx({ stepBaselineTick: 10, session: { tickIndex: 12 } }))).toBe(false);
    });

    it('treats a baseline of 0 the same as a fresh session', () => {
      const p = ticksSinceStepAtLeast(2);
      expect(p(makeCtx({ stepBaselineTick: 0, session: { tickIndex: 2 } }))).toBe(true);
    });
  });

  describe('combineAll / combineAny / not', () => {
    it('combineAll is true only when every predicate is true', () => {
      const p = combineAll(tickAtLeast(5), onRoute('/play'));
      expect(p(makeCtx({ session: { tickIndex: 5 }, route: { path: '/play' } }))).toBe(true);
      expect(p(makeCtx({ session: { tickIndex: 4 }, route: { path: '/play' } }))).toBe(false);
      expect(p(makeCtx({ session: { tickIndex: 5 }, route: { path: '/tour' } }))).toBe(false);
    });

    it('combineAll with no predicates is true (vacuous AND)', () => {
      expect(combineAll()(makeCtx({}))).toBe(true);
    });

    it('combineAny is true when at least one predicate is true', () => {
      const p = combineAny(tickAtLeast(100), onRoute('/play'));
      expect(p(makeCtx({ session: { tickIndex: 0 }, route: { path: '/play' } }))).toBe(true);
      expect(p(makeCtx({ session: { tickIndex: 0 }, route: { path: '/' } }))).toBe(false);
    });

    it('combineAny with no predicates is false (vacuous OR)', () => {
      expect(combineAny()(makeCtx({}))).toBe(false);
    });

    it('not inverts the wrapped predicate', () => {
      expect(not(ALWAYS)(makeCtx({}))).toBe(false);
      expect(not(NEVER)(makeCtx({}))).toBe(true);
    });
  });

  describe('TourCtx is consumed read-only', () => {
    it('predicates do not mutate the supplied context', () => {
      const ctx = makeCtx({
        session: {
          tickIndex: 1,
          recentEvents: [{ type: 'AGENT_TICKED', tickIndex: 1 }],
        },
        route: {
          path: '/tour/1',
          tourStep: walkthroughStepId('chapter-1.start'),
        },
      });
      const before = JSON.stringify(ctx);
      combineAll(tickAtLeast(1), eventEmittedSince('AGENT_TICKED', 0), onRoutePrefix('/tour'))(ctx);
      expect(JSON.stringify(ctx)).toBe(before);
    });
  });
});
