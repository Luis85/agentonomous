import type { Reasoner, ReasonerContext } from 'agentonomous';
import type { CognitionModeSpec } from './index.js';

const TREAT_EVENT_SUBTYPE = 'surpriseTreat';
const INTERRUPT_TICKS = 3;

/**
 * BT cognition mode — differentiated via a reactive interrupt on the
 * `surpriseTreat` random event. Normal ticks mirror the heuristic's
 * top-candidate pick via `PickTopCandidate`. When a `surpriseTreat`
 * event arrives in `ctx.perceived`, the BT locks in the
 * `approach-treat` skill for `INTERRUPT_TICKS` ticks measured from
 * the most recent treat. A second treat during the window refreshes
 * the counter back to `INTERRUPT_TICKS` rather than adding another
 * burst on top. Effective behaviour: "keep approaching while treats
 * keep arriving, then resume urgency."
 *
 * Counter state lives in the closure returned by `construct()` — a
 * mode swap produces a fresh closure, wiping the counter. Matches the
 * library's `setReasoner` contract ("nothing transferred from the
 * outgoing reasoner").
 *
 * `construct()` is async so the adapter subpath (which pulls
 * `mistreevous` as a side effect) only loads when this mode is
 * actually selected — keeping the peer out of the main chunk.
 */
export const btMode: CognitionModeSpec = {
  id: 'bt',
  label: 'Behaviour Tree',
  peerName: 'mistreevous',
  async probe(): Promise<boolean> {
    try {
      await import('mistreevous');
      return true;
    } catch {
      return false;
    }
  },
  async construct(): Promise<Reasoner> {
    // The adapter subpath re-exports `MistreevousReasoner` plus
    // `MistreevousState` (aliased from mistreevous' own `State`), so a
    // single dynamic import handles both the reasoner class and the
    // state enum handlers need to return. Importing the adapter also
    // transitively loads `mistreevous`, keeping the peer out of the
    // main chunk.
    const { MistreevousReasoner, MistreevousState } =
      await import('agentonomous/cognition/adapters/mistreevous');

    let remainingTreatTicks = 0;

    return new MistreevousReasoner({
      definition: `
        root {
          selector {
            sequence {
              condition [IsReactingToTreat]
              action    [RunApproachTreat]
            }
            action [PickTopCandidate]
          }
        }
      `,
      handlers: {
        IsReactingToTreat(ctx: ReasonerContext): boolean {
          const sawTreat = ctx.perceived.some(
            (e) =>
              e.type === 'RandomEvent' &&
              (e as { subtype?: string }).subtype === TREAT_EVENT_SUBTYPE,
          );
          if (sawTreat) remainingTreatTicks = INTERRUPT_TICKS;
          if (remainingTreatTicks > 0) {
            remainingTreatTicks -= 1;
            return true;
          }
          return false;
        },
        RunApproachTreat(_ctx, helpers) {
          // Relies on main.ts wiring a DirectBehaviorRunner mapping
          // `approach-treat` → the `approach-treat` skill. Without that
          // mapping this intention falls through to the runner's noop
          // fallback and the trace panel shows no selection for the
          // interrupt window.
          helpers.commit({
            kind: 'react',
            type: 'approach-treat',
            target: 'treat',
          });
          return MistreevousState.RUNNING;
        },
        PickTopCandidate(_ctx, helpers) {
          const top = helpers.topCandidate();
          if (top) helpers.commit(top.intention);
          return MistreevousState.SUCCEEDED;
        },
      },
    });
  },
};
