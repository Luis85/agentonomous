/**
 * Test-only stub for the optional `brain.js` peer dep.
 *
 * `brain.js` is declared as an **optional** peer of `agentonomous` and
 * as a devDep of the `nurture-pet` demo workspace — **not** a root
 * devDep. That's intentional: its transitive dep chain (`gpu.js` →
 * `gl`) needs an X11 native build that explodes on headless CI. See
 * `src/cognition/adapters/brainjs/brain.d.ts` for the ambient typedef
 * that lets TS compile without it installed.
 *
 * At runtime, the demo's `learning.ts` wraps `await import('brain.js')`
 * in a try/catch precisely so a missing peer degrades gracefully
 * (option renders disabled). But Vite's `vite:import-analysis` plugin
 * eagerly resolves every dynamic import's specifier at transform time
 * before the try/catch can run — and root `npm ci` on CI doesn't
 * install `brain.js`, so transform fails.
 *
 * This stub exists so the vitest alias in `vite.config.ts` can route
 * `import('brain.js')` to something resolvable. It covers the shape
 * `learning.ts` actually uses: `run()` returns a stable `[0.5]` so
 * `construct()` and urgency-gate logic are testable without the native
 * peer; `fromJSON()` records its last argument; `train()` records the
 * last batch it received; `toJSON()` returns a deterministic sentinel
 * derived from recorded calls.
 */
export class NeuralNetwork<In = unknown, Out = unknown> {
  /**
   * The most recently constructed instance. Tests inspect this to
   * verify what `learning.ts` passed into `fromJSON()` / `train()`
   * without needing to plumb the network through application code.
   */
  static last: NeuralNetwork<unknown, unknown> | null = null;

  #weights: unknown = null;
  #lastTrain: unknown = null;

  constructor() {
    NeuralNetwork.last = this as unknown as NeuralNetwork<unknown, unknown>;
  }

  run(_input: In): Out {
    return [0.5] as unknown as Out;
  }

  fromJSON(json: unknown): this {
    this.#weights = json;
    return this;
  }

  toJSON(): unknown {
    return { stub: true, trainedFrom: this.#lastTrain, seededFrom: this.#weights };
  }

  train(pairs: unknown, _opts: unknown): void {
    this.#lastTrain = pairs;
  }

  lastTrainPairs(): unknown {
    return this.#lastTrain;
  }

  lastFromJSON(): unknown {
    return this.#weights;
  }
}

export default { NeuralNetwork };
