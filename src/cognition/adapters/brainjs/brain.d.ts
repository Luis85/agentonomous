// Ambient type declarations for the optional `brain.js` peer dep.
//
// `brain.js` does ship its own TypeScript declarations, but depending on
// it as a devDependency pulls `gpu.js` (a required peer) — which in turn
// pulls the `gl` native binding that needs X11 headers at install time.
// Those aren't available on a headless CI runner, and on a developer
// machine they add a minutes-long native compile for a module we only
// ever touch via types.
//
// This shim covers the slim slice our adapter relies on — the
// `NeuralNetwork<In, Out>` class with `run(input: In): Out`. Consumers
// install `brain.js` themselves (it's an optional peer) and their own
// types take precedence over this shim via module resolution.
declare module 'brain.js' {
  export class NeuralNetwork<In = unknown, Out = unknown> {
    run(input: In): Out;
  }
}
