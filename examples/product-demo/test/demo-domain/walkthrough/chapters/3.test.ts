import { describe, expect, it } from 'vitest';

import { chapter3Steps } from '../../../../src/demo-domain/walkthrough/chapters/3.js';
import { STEP_ID_COGNITION_OBSERVE, STEP_ID_COGNITION_SWAP } from '../../../../src/copy/tour.js';
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

describe('chapter-3 (cognition switching)', () => {
  const swap = chapter3Steps.find((s) => s.id === STEP_ID_COGNITION_SWAP)!;
  const observe = chapter3Steps.find((s) => s.id === STEP_ID_COGNITION_OBSERVE)!;

  describe('cognition-swap step', () => {
    it('does not fire while the active mode is the default heuristic', () => {
      expect(swap.completionPredicate(makeCtx({}))).toBe(false);
    });

    it('fires once the user picks any non-default mode', () => {
      const ctx = makeCtx({ session: { cognitionModeId: 'bt' } });
      expect(swap.completionPredicate(ctx)).toBe(true);
    });
  });

  describe('cognition-observe step', () => {
    it('does NOT fire while the simulation is paused (AgentTicked emitted but no virtual-time progression)', () => {
      // Reproduces the paused-tick race: `useAgentSession` still records
      // AGENT_TICKED at `timeScale === 0` for the trace panel, but
      // `tickIndex` does not advance. Without the dwell-tick gate
      // chapter-3 step-2 would auto-complete here.
      const ctx = makeCtx({
        stepBaselineTick: 4,
        session: {
          tickIndex: 4, // unchanged since baseline → paused
          recentEvents: [{ type: 'AgentTicked', tickIndex: 4 }],
        },
      });
      expect(observe.completionPredicate(ctx)).toBe(false);
    });

    it('fires when an AgentTicked event landed AND virtual time advanced past the baseline', () => {
      const ctx = makeCtx({
        stepBaselineTick: 4,
        session: {
          tickIndex: 5,
          recentEvents: [{ type: 'AgentTicked', tickIndex: 5 }],
        },
      });
      expect(observe.completionPredicate(ctx)).toBe(true);
    });

    it('does not fire on virtual-time progression alone (no AgentTicked emitted yet)', () => {
      const ctx = makeCtx({
        stepBaselineTick: 4,
        session: {
          tickIndex: 5,
          recentEvents: [{ type: 'SomethingElse', tickIndex: 5 }],
        },
      });
      expect(observe.completionPredicate(ctx)).toBe(false);
    });
  });
});
