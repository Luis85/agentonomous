import {
  Agent as JsSonAgent,
  type JsSonAgentOptions,
  type JsSonBeliefs,
  type JsSonDesires,
  type JsSonPlan,
} from 'js-son-agent';
import type { Intention } from '../../Intention.js';
import type { IntentionCandidate } from '../../IntentionCandidate.js';
import type { Reasoner, ReasonerContext } from '../../reasoning/Reasoner.js';

/**
 * Helpers passed to the default / consumer-provided `toBeliefs` mapper.
 * Used to derive belief updates from the structured `ReasonerContext`
 * without each plan having to rewrite scoring logic.
 */
export interface JsSonBeliefHelpers {
  /**
   * Highest-scoring candidate matching `filter` (or any candidate when
   * `filter` is omitted). Mirrors the mistreevous adapter's helper for
   * symmetry. Typed as a property (not a method) so consumers can pass
   * it through into beliefs without losing `this` binding.
   */
  topCandidate: (filter?: (c: IntentionCandidate) => boolean) => IntentionCandidate | null;
  /** Flat `{id: level}` snapshot of the agent's needs, or `{}` if unset. */
  needsLevels: () => Record<string, number>;
}

/**
 * Maps the per-tick `ReasonerContext` to a js-son belief update object.
 * The return value is merged into the underlying agent's beliefs via its
 * configured `reviseBeliefs` function (defaults to non-monotonic merge).
 */
export type JsSonBeliefMapper = (ctx: ReasonerContext, helpers: JsSonBeliefHelpers) => JsSonBeliefs;

/**
 * Constructor options for `JsSonReasoner`.
 *
 * The three BDI ingredients (`beliefs`, `desires`, `plans`) are forwarded
 * straight through to the underlying js-son `Agent`. The adapter only
 * layers the per-tick context mapping and intention extraction on top.
 */
export interface JsSonReasonerOptions {
  /**
   * Initial beliefs — the object that `new Agent({ beliefs })` is seeded
   * with. Typically assembled via the `Belief()` helper from
   * `js-son-agent`. Consumer-owned; the adapter does not add to it.
   */
  beliefs: JsSonBeliefs;
  /**
   * Map of desire id → belief predicate. Defaults to `{}` (no desires).
   * When empty js-son short-circuits `intentions = beliefs`.
   */
  desires?: JsSonDesires;
  /**
   * BDI plans. Each plan body returns an array of action objects; the
   * adapter treats any action containing an `intention` field as the
   * committed intention for that tick. Later wins if multiple plans
   * commit, matching the mistreevous adapter's "last commit wins" rule.
   *
   * Note on `intentions` vs `beliefs` inside a plan body: when `desires`
   * is non-empty, the body receives only the filtered desire results
   * (not the full belief object). To still reach `topCandidate` /
   * `needs` / `candidates` in that case, either define a no-desire
   * reasoner (then `intentions === beliefs`) or read from `this.beliefs`
   * inside a `function() { ... }` body — js-son binds the agent as
   * `this` when `selfUpdatesPossible` is true (default).
   */
  plans: readonly JsSonPlan[];
  /**
   * Optional preference function forwarded as js-son's
   * `determinePreferences`. See
   * [`js-son-agent` README](https://github.com/TimKam/js-son#agent).
   */
  preferenceFunction?: JsSonAgentOptions['determinePreferences'];
  /** Optional belief-revision function forwarded to the underlying Agent. */
  reviseBeliefs?: JsSonAgentOptions['reviseBeliefs'];
  /**
   * Maps `ReasonerContext` → belief updates. Runs every `selectIntention`
   * call. Defaults to a mapper that exposes `needs` (flat
   * `{id: level}`), `candidates` (the raw array), and `topCandidate` (a
   * helper function) as beliefs of those names.
   */
  toBeliefs?: JsSonBeliefMapper;
  /**
   * Optional agent id. Defaults to `'agentonomous'`. Only surfaces in
   * js-son's multi-agent `Environment` flows, which this adapter does
   * not use.
   */
  id?: string;
}

const INTENTION_KEY = 'intention' as const;

function defaultToBeliefs(_ctx: ReasonerContext, helpers: JsSonBeliefHelpers): JsSonBeliefs {
  return {
    needs: helpers.needsLevels(),
    candidates: [..._ctx.candidates],
    topCandidate: helpers.topCandidate,
  };
}

function isIntentionAction(action: unknown): action is { [INTENTION_KEY]: Intention } {
  return (
    typeof action === 'object' &&
    action !== null &&
    INTENTION_KEY in action &&
    typeof (action as Record<string, unknown>)[INTENTION_KEY] === 'object' &&
    (action as Record<string, unknown>)[INTENTION_KEY] !== null
  );
}

/**
 * Reasoner adapter that delegates intention selection to a
 * [`js-son-agent`](https://github.com/TimKam/js-son) BDI agent. Each
 * call to `selectIntention(ctx)`:
 *
 * 1. Builds belief updates from `ctx` via `toBeliefs` (defaults exposed
 *    are `needs`, `candidates`, `topCandidate`).
 * 2. Calls `agent.next(beliefUpdates)` — js-son computes intentions from
 *    desires, then runs each plan's head+body.
 * 3. Scans the returned actions for one with an `intention` field and
 *    returns it (last wins). Returns `null` if no plan committed.
 *
 * Determinism: js-son itself doesn't consult `Math.random` or
 * `Date.now`; plan evaluation follows array order. Keep plan bodies
 * pure w.r.t. the inputs and determinism is preserved.
 */
export class JsSonReasoner implements Reasoner {
  private agent: JsSonAgent;
  private readonly init: Required<Pick<JsSonReasonerOptions, 'beliefs' | 'plans' | 'id'>> &
    JsSonReasonerOptions;
  private readonly toBeliefs: JsSonBeliefMapper;

  constructor(opts: JsSonReasonerOptions) {
    this.init = {
      ...opts,
      id: opts.id ?? 'agentonomous',
      beliefs: opts.beliefs,
      plans: opts.plans,
    };
    this.toBeliefs = opts.toBeliefs ?? defaultToBeliefs;
    this.agent = this.buildAgent();
  }

  selectIntention(ctx: ReasonerContext): Intention | null {
    const helpers: JsSonBeliefHelpers = {
      topCandidate: (filter) => {
        let best: IntentionCandidate | null = null;
        for (const c of ctx.candidates) {
          if (filter && !filter(c)) continue;
          if (!best || c.score > best.score) best = c;
        }
        return best;
      },
      needsLevels: () => {
        const needs = ctx.needs;
        if (!needs) return {};
        const out: Record<string, number> = {};
        for (const n of needs.list()) out[n.id] = n.level;
        return out;
      },
    };

    const beliefUpdates = this.toBeliefs(ctx, helpers);
    const planResults = this.agent.next(beliefUpdates);

    let selected: Intention | null = null;
    for (const actions of planResults) {
      for (const action of actions) {
        if (isIntentionAction(action)) selected = action.intention;
      }
    }
    return selected;
  }

  /**
   * Rebuilds the wrapped js-son agent from the constructor's initial
   * options: beliefs revert to the initial map; desires and plans are
   * reinstalled from the saved descriptors. Implements the
   * `Reasoner.reset` port contract (see
   * `src/cognition/reasoning/Reasoner.ts`).
   */
  reset(): void {
    this.agent = this.buildAgent();
  }

  /** Read-only snapshot of the agent's current beliefs. */
  getBeliefs(): JsSonBeliefs {
    return { ...this.agent.beliefs };
  }

  private buildAgent(): JsSonAgent {
    const agentOpts: JsSonAgentOptions = {
      id: this.init.id,
      beliefs: { ...this.init.beliefs },
      desires: this.init.desires ?? {},
      plans: this.init.plans,
    };
    if (this.init.preferenceFunction) {
      agentOpts.determinePreferences = this.init.preferenceFunction;
    }
    if (this.init.reviseBeliefs) {
      agentOpts.reviseBeliefs = this.init.reviseBeliefs;
    }
    return new JsSonAgent(agentOpts);
  }
}

export type { JsSonAction, JsSonBeliefs, JsSonDesires, JsSonPlan } from 'js-son-agent';
