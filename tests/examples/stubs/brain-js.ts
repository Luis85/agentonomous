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
 * `import('brain.js')` to something resolvable. The tests in
 * `tests/examples/cognitionSwitcher.test.ts` never call
 * `learningMode.construct()` — they only care whether the probe
 * resolves — so exporting a placeholder `NeuralNetwork` is enough to
 * keep the module shape plausible without pulling the native chain.
 */
export class NeuralNetwork<In = unknown, Out = unknown> {
  run(_input: In): Out {
    throw new Error('brain.js stub: NeuralNetwork.run() is not implemented in the test stub.');
  }
  fromJSON(_json: unknown): this {
    return this;
  }
}

export default { NeuralNetwork };
