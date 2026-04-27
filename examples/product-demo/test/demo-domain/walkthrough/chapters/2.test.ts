import { describe, expect, it } from 'vitest';

import { chapter2Steps } from '../../../../src/demo-domain/walkthrough/chapters/2.js';
import { STEP_ID_TRACE_OBSERVE, STEP_ID_TRACE_OPEN } from '../../../../src/copy/tour.js';
import type {
  AgentSessionSnapshot,
  RouteContext,
  TourCtx,
} from '../../../../src/demo-domain/walkthrough/types.js';

function makeCtx(overrides: {
  session?: Partial<AgentSessionSnapshot>;
  route?: Partial<RouteContext>;
  stepBaselineTick?: number;
}): TourCtx {
  const session: AgentSessionSnapshot = {
    tickIndex: overrides.session?.tickIndex ?? 0,
    cognitionModeId: overrides.session?.cognitionModeId ?? 'heuristic',
    seed: overrides.session?.seed ?? 1,
    recentEvents: overrides.session?.recentEvents ?? [],
  };
  const route: RouteContext = {
    path: overrides.route?.path ?? '/play',
    scenarioId: overrides.route?.scenarioId ?? null,
    tourStep: overrides.route?.tourStep ?? null,
  };
  return { session, route, stepBaselineTick: overrides.stepBaselineTick ?? 0 };
}

describe('chapter-2 (trace visibility)', () => {
  const traceOpen = chapter2Steps.find((s) => s.id === STEP_ID_TRACE_OPEN)!;
  const traceObserve = chapter2Steps.find((s) => s.id === STEP_ID_TRACE_OBSERVE)!;

  describe('trace-open step', () => {
    it('is satisfied by a TracePanelOpened event emitted before the chapter started', () => {
      // Returning-user case: the trace panel was visible from a previous
      // session, so `TracePanel` emits `TracePanelOpened` on mount at
      // tick 0. By the time chapter-2 starts (e.g., baseline tick 5),
      // a step-scoped predicate would filter that event out. The
      // session-scoped predicate accepts it and lets chapter-2 advance.
      const ctx = makeCtx({
        stepBaselineTick: 5,
        session: {
          tickIndex: 5,
          recentEvents: [{ type: 'TracePanelOpened', tickIndex: 0 }],
        },
      });
      expect(traceOpen.completionPredicate(ctx)).toBe(true);
    });

    it('is satisfied by a TracePanelOpened event emitted during the step itself', () => {
      // Cold-start user toggles the panel mid-chapter — predicate
      // fires on the live emission as well.
      const ctx = makeCtx({
        stepBaselineTick: 5,
        session: {
          tickIndex: 6,
          recentEvents: [{ type: 'TracePanelOpened', tickIndex: 6 }],
        },
      });
      expect(traceOpen.completionPredicate(ctx)).toBe(true);
    });

    it('is not satisfied when no TracePanelOpened event has been recorded', () => {
      const ctx = makeCtx({
        stepBaselineTick: 5,
        session: {
          tickIndex: 6,
          recentEvents: [{ type: 'AgentTicked', tickIndex: 6 }],
        },
      });
      expect(traceOpen.completionPredicate(ctx)).toBe(false);
    });
  });

  describe('trace-observe step', () => {
    it('is satisfied when an AgentTicked event AND the dwell-tick gate both fire after the step started', () => {
      const ctx = makeCtx({
        stepBaselineTick: 5,
        session: {
          tickIndex: 6,
          recentEvents: [{ type: 'AgentTicked', tickIndex: 6 }],
        },
      });
      expect(traceObserve.completionPredicate(ctx)).toBe(true);
    });

    it('is NOT satisfied while paused — AgentTicked fires but tickIndex stays put', () => {
      const ctx = makeCtx({
        stepBaselineTick: 5,
        session: {
          tickIndex: 5,
          recentEvents: [{ type: 'AgentTicked', tickIndex: 5 }],
        },
      });
      expect(traceObserve.completionPredicate(ctx)).toBe(false);
    });
  });
});
