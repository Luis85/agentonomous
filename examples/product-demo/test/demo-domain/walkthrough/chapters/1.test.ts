import { describe, expect, it } from 'vitest';

import { chapter1Steps } from '../../../../src/demo-domain/walkthrough/chapters/1.js';
import { STEP_ID_AUTONOMY } from '../../../../src/copy/tour.js';
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

describe('chapter-1 (autonomy)', () => {
  const autonomy = chapter1Steps.find((s) => s.id === STEP_ID_AUTONOMY)!;

  it('is not satisfied immediately after restart on a long-running session', () => {
    // `tour.restart()` rebases the step baseline to the current
    // session.tickIndex but does NOT clear session history. With the
    // step-scoped predicates, the step still has to wait for fresh
    // tick + AgentTicked evidence.
    const ctx = makeCtx({
      stepBaselineTick: 100,
      session: {
        tickIndex: 100,
        recentEvents: Array.from({ length: 50 }, (_, i) => ({
          type: 'AgentTicked',
          tickIndex: i + 1,
        })),
      },
    });
    expect(autonomy.completionPredicate(ctx)).toBe(false);
  });

  it('is satisfied after enough fresh ticks + an AgentTicked since the step started', () => {
    const ctx = makeCtx({
      stepBaselineTick: 100,
      session: {
        tickIndex: 103,
        recentEvents: [{ type: 'AgentTicked', tickIndex: 103 }],
      },
    });
    expect(autonomy.completionPredicate(ctx)).toBe(true);
  });

  it('is not satisfied by ticks alone if no AgentTicked has fired since the step started', () => {
    const ctx = makeCtx({
      stepBaselineTick: 100,
      session: {
        tickIndex: 110,
        recentEvents: [],
      },
    });
    expect(autonomy.completionPredicate(ctx)).toBe(false);
  });
});
