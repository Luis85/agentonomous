import { BehaviourTree, type BehaviourTreeOptions, type State } from 'mistreevous';
import type { Intention } from '../../Intention.js';
import type { IntentionCandidate } from '../../IntentionCandidate.js';
import type { Reasoner, ReasonerContext } from '../../reasoning/Reasoner.js';

/**
 * Helpers exposed to behaviour-tree handler functions. Closes over the
 * adapter's per-tick state so handlers can read the current
 * `ReasonerContext` and commit to an `Intention` without owning a
 * reference to the agent itself.
 */
export type MistreevousHelpers = {
  /**
   * Commit to an intention. The most recent commit wins per
   * `selectIntention` call; uncommitted ticks return `null`.
   */
  commit(intention: Intention): void;
  /**
   * Highest-scoring candidate matching `filter` (or any candidate when
   * `filter` is omitted). Returns `null` when no candidate matches.
   */
  topCandidate(filter?: (c: IntentionCandidate) => boolean): IntentionCandidate | null;
};

/**
 * Handler signature for action / condition nodes in the behaviour tree.
 * Mistreevous calls these with a `this` bound to its internal agent
 * object; the adapter wraps them so handlers receive the structured
 * `ReasonerContext` + `MistreevousHelpers` instead.
 *
 * Return-value rules follow mistreevous semantics — these are checked
 * at runtime by the underlying tree:
 *
 * - **Action** nodes must return `State.SUCCEEDED`, `State.FAILED`,
 *   `State.RUNNING`, or `void` (treated as SUCCEEDED).
 * - **Condition** nodes must return `boolean`.
 *
 * The adapter doesn't enforce which kind a given handler is bound to
 * (that's encoded in the BT definition), so the type is the union of
 * both.
 */
export type MistreevousHandler = (
  ctx: ReasonerContext,
  helpers: MistreevousHelpers,
  ...args: unknown[]
) => boolean | State | void;

/**
 * Constructor options for `MistreevousReasoner`. `definition` is passed
 * straight through to the underlying `BehaviourTree`; `handlers` maps
 * BT action / condition node names to functions the adapter will route
 * mistreevous calls to.
 */
export type MistreevousReasonerOptions = {
  /**
   * Behaviour-tree definition, in mistreevous' MDSL string form or its
   * structured `RootNodeDefinition` form. Passed straight to
   * `new BehaviourTree(definition, agent, options)`.
   */
  definition: ConstructorParameters<typeof BehaviourTree>[0];
  /**
   * Map of BT handler names → handler functions. The adapter exposes
   * each entry as `agent[name]` to the underlying tree.
   */
  handlers: Record<string, MistreevousHandler>;
  /**
   * Optional deterministic RNG. Forwarded to mistreevous as its
   * `options.random` so `lotto` / `wait` / `repeat` / `retry` nodes
   * stay byte-identical under a fixed seed. Defaults to the
   * mistreevous default (`Math.random`).
   */
  random?: () => number;
  /**
   * Optional deterministic delta-time source for `wait` nodes.
   * Forwarded to mistreevous as `options.getDeltaTime`.
   */
  getDeltaTime?: () => number;
};

/**
 * Reasoner adapter that delegates intention selection to a
 * [`mistreevous`](https://www.npmjs.com/package/mistreevous) behaviour
 * tree. Each call to `selectIntention(ctx)` steps the tree once; action
 * handlers commit the chosen intention via `helpers.commit(intention)`.
 *
 * The tree is **stateful across ticks** by design — `RUNNING` leaves
 * resume on the next step, mirroring how BTs are normally driven. Use
 * `reset()` to manually rewind, e.g. after a major state shift like a
 * lifecycle stage transition.
 *
 * Determinism: pass `random` (and optionally `getDeltaTime`) sourced
 * from the agent's `Rng` / virtual clock to keep `lotto` / `wait` /
 * `repeat` / `retry` nodes seeded. The adapter never reaches for
 * `Math.random` or `Date.now` itself.
 */
export class MistreevousReasoner implements Reasoner {
  private readonly tree: BehaviourTree;
  private currentCtx: ReasonerContext | null = null;
  private selected: Intention | null = null;

  constructor(opts: MistreevousReasonerOptions) {
    const helpers: MistreevousHelpers = {
      commit: (intention) => {
        this.selected = intention;
      },
      topCandidate: (filter) => {
        const ctx = this.currentCtx;
        if (!ctx) return null;
        let best: IntentionCandidate | null = null;
        for (const c of ctx.candidates) {
          if (filter && !filter(c)) continue;
          if (!best || c.score > best.score) best = c;
        }
        return best;
      },
    };

    const agent: Record<string, (...args: unknown[]) => boolean | State | void> = {};
    for (const [name, fn] of Object.entries(opts.handlers)) {
      agent[name] = (...args: unknown[]) => {
        const ctx = this.currentCtx;
        if (!ctx) {
          // BT was stepped outside selectIntention — treat as no-op.
          return false;
        }
        return fn(ctx, helpers, ...args);
      };
    }

    const treeOptions: BehaviourTreeOptions = {};
    if (opts.random) treeOptions.random = opts.random;
    if (opts.getDeltaTime) treeOptions.getDeltaTime = opts.getDeltaTime;
    this.tree = new BehaviourTree(opts.definition, agent, treeOptions);
  }

  selectIntention(ctx: ReasonerContext): Intention | null {
    this.currentCtx = ctx;
    this.selected = null;
    try {
      this.tree.step();
    } finally {
      this.currentCtx = null;
    }
    return this.selected;
  }

  /**
   * Returns the BT to `READY`. Any `RUNNING` node state — including
   * mid-sequence continuations — is cleared. Implements the `Reasoner.reset`
   * port contract (see `src/cognition/reasoning/Reasoner.ts`).
   */
  reset(): void {
    this.tree.reset();
  }

  /** Underlying tree state — useful for inspectors / debug overlays. */
  getTreeState(): State {
    return this.tree.getState();
  }
}
