import type { NeuralNetwork } from 'brain.js';
import type { Intention } from '../../Intention.js';
import type { IntentionCandidate } from '../../IntentionCandidate.js';
import type { Reasoner, ReasonerContext } from '../../reasoning/Reasoner.js';

/**
 * Mirror of brain.js's internal `INeuralNetworkData` constraint. The
 * upstream type is declared in `brain.js/dist/neural-network` but not
 * re-exported from the package root, so inlining it here lets the
 * adapter stay a type-only consumer of the top-level `brain.js` module.
 */
export type BrainJsNetworkData = number[] | Float32Array | Partial<Record<string, number>>;

/**
 * Helpers passed to the consumer-provided feature / output mappers.
 * Same shape as the mistreevous and js-son adapters for symmetry.
 */
export interface BrainJsHelpers {
  /** Raw candidates array from the tick's `ReasonerContext`. */
  candidates: readonly IntentionCandidate[];
  /**
   * Highest-scoring candidate matching `filter` (or any candidate when
   * `filter` is omitted). Typed as a property (not a method) so it can
   * be captured without losing its `this` binding.
   */
  topCandidate: (filter?: (c: IntentionCandidate) => boolean) => IntentionCandidate | null;
  /**
   * Flat `{id: level}` snapshot of the agent's needs, or `{}` if unset.
   * Convenient feature source — the default caller is `featuresOf`.
   */
  needsLevels: () => Record<string, number>;
}

/**
 * Constructor options for `BrainJsReasoner`.
 *
 * The network itself (weights, architecture) is owned by the consumer —
 * typically trained offline and passed in already-hydrated via
 * `new NeuralNetwork().fromJSON(savedJson)`. The adapter only drives
 * per-tick inference; it does not call `train()` (which would mutate
 * weights and introduce non-deterministic behaviour via `Math.random`).
 */
export interface BrainJsReasonerOptions<
  In extends BrainJsNetworkData = BrainJsNetworkData,
  Out extends BrainJsNetworkData = BrainJsNetworkData,
> {
  /** A brain.js neural network, trained and ready for `run()`. */
  network: NeuralNetwork<In, Out>;
  /** Maps `ReasonerContext` → the input vector for the network. */
  featuresOf: (ctx: ReasonerContext, helpers: BrainJsHelpers) => In;
  /**
   * Interprets the network output into an `Intention` (or `null` to
   * idle). Receives `helpers` so consumers can, e.g., pick the highest
   * scoring candidate after biasing by the output.
   */
  interpret: (output: Out, ctx: ReasonerContext, helpers: BrainJsHelpers) => Intention | null;
}

/**
 * Reasoner adapter that delegates intention selection to a
 * [`brain.js`](https://github.com/BrainJS/brain.js) neural network.
 * Each call to `selectIntention(ctx)`:
 *
 * 1. Builds an input vector from `ctx` via `featuresOf`.
 * 2. Calls `network.run(features)` — pure inference, no state change.
 * 3. Passes the output to `interpret`, which returns the committed
 *    `Intention` (or `null` to idle).
 *
 * Determinism: `NeuralNetwork.run()` is a forward pass with fixed
 * weights — no `Math.random`, no `Date.now`. As long as the consumer
 * doesn't retrain the network live (or does so with a seeded source
 * outside the agent loop), the whole pipeline is byte-deterministic.
 *
 * Training is explicitly out of scope for the adapter: brain.js's
 * `.train()` consults `Math.random` for weight initialisation and SGD
 * shuffling. Train offline, serialise with `.toJSON()`, and rehydrate
 * at construction time via `new NeuralNetwork().fromJSON(saved)`.
 *
 * This adapter does not implement `Reasoner.reset()`. It has no
 * ephemeral between-tick state: the wrapped `NeuralNetwork` is used in
 * forward-pass-only mode and its weights are consumer-owned (hydrated
 * via the constructor and preserved for the adapter's lifetime). The
 * kernel's null-safe `reset?.()` call handles the absence without
 * requiring a no-op here.
 */
export class BrainJsReasoner<
  In extends BrainJsNetworkData = BrainJsNetworkData,
  Out extends BrainJsNetworkData = BrainJsNetworkData,
> implements Reasoner {
  private readonly network: NeuralNetwork<In, Out>;
  private readonly featuresOf: BrainJsReasonerOptions<In, Out>['featuresOf'];
  private readonly interpret: BrainJsReasonerOptions<In, Out>['interpret'];

  constructor(opts: BrainJsReasonerOptions<In, Out>) {
    this.network = opts.network;
    this.featuresOf = opts.featuresOf;
    this.interpret = opts.interpret;
  }

  selectIntention(ctx: ReasonerContext): Intention | null {
    const helpers: BrainJsHelpers = {
      candidates: ctx.candidates,
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

    const features = this.featuresOf(ctx, helpers);
    const output = this.network.run(features);
    return this.interpret(output, ctx, helpers);
  }

  /**
   * Read-only handle on the underlying network, useful for inspectors
   * and for consumers who want to call `toJSON()` to persist trained
   * weights.
   */
  getNetwork(): NeuralNetwork<In, Out> {
    return this.network;
  }
}
