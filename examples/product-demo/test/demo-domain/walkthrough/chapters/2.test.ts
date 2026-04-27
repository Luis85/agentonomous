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
    it('is satisfied when the panel is currently visible (returning user, restored open)', () => {
      // Returning-user case: TracePanel emitted TracePanelOpened on
      // mount when restored visible. No subsequent close → predicate
      // sees the latest matching event is "open" → satisfied.
      const ctx = makeCtx({
        stepBaselineTick: 5,
        session: {
          tickIndex: 5,
          recentEvents: [
            { type: 'AgentTicked', tickIndex: 1 },
            { type: 'TracePanelOpened', tickIndex: 0 },
            { type: 'AgentTicked', tickIndex: 2 },
          ],
        },
      });
      expect(traceOpen.completionPredicate(ctx)).toBe(true);
    });

    it('is satisfied when the user toggles the panel open mid-chapter', () => {
      const ctx = makeCtx({
        stepBaselineTick: 5,
        session: {
          tickIndex: 6,
          recentEvents: [{ type: 'TracePanelOpened', tickIndex: 6 }],
        },
      });
      expect(traceOpen.completionPredicate(ctx)).toBe(true);
    });

    it('is NOT satisfied when the user opened then closed the panel before chapter-2', () => {
      // The latest matching event is "closed" → flag is OFF, the user
      // must reopen the panel on chapter-2 itself to advance.
      const ctx = makeCtx({
        stepBaselineTick: 5,
        session: {
          tickIndex: 5,
          recentEvents: [
            { type: 'TracePanelOpened', tickIndex: 1 },
            { type: 'TracePanelClosed', tickIndex: 2 },
          ],
        },
      });
      expect(traceOpen.completionPredicate(ctx)).toBe(false);
    });

    it('is not satisfied when the panel has never been opened', () => {
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
