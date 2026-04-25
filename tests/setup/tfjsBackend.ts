/**
 * Per-suite tfjs backend selector for the CI matrix.
 *
 * Reads `process.env.TFJS_BACKEND` ("cpu" or "wasm"; defaults to "cpu")
 * and resolves a single shared backend name that:
 *
 * 1. The Vitest setup file (`tests/setup/tfjsBackendSetup.ts`) uses to
 *    side-effect-import the matching `@tensorflow/tfjs-backend-*`
 *    package and call `tf.setBackend(name)` BEFORE any test file's
 *    static imports run. This guarantees `tf.getBackend()` reports the
 *    matrix-selected backend by the time test bodies execute.
 * 2. Test files import as `TEST_BACKEND` and pass to `new TfjsReasoner`
 *    / `TfjsReasoner.fromJSON` so the constructor's "requested backend
 *    must match active backend" guard is honored on every cell of the
 *    OS × backend matrix (see `.github/workflows/ci.yml#test-tfjs`).
 *
 * Locally (without env var set) tests behave exactly as before — the
 * default is `"cpu"`, mirroring the historical hard-coded value.
 *
 * @remarks Library code never reads this — it lives under `tests/`
 * specifically so the public `TfjsReasoner` surface stays unchanged.
 */
const RAW = process.env.TFJS_BACKEND;

/**
 * The tfjs backend chosen for this test run. Always one of the values
 * the CI matrix exercises; unknown env values fall back to `"cpu"` so
 * a typo in a runner config can't silently swap backends.
 */
export const TEST_BACKEND: 'cpu' | 'wasm' = RAW === 'wasm' ? 'wasm' : 'cpu';
