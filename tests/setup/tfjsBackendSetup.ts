/**
 * Vitest `setupFiles` entry — runs once per test worker BEFORE any
 * `tests/**\/*.test.ts` file is imported. Its job is to side-effect-
 * import the tfjs backend package selected by `TFJS_BACKEND` so that
 * subsequent test-file static imports of `@tensorflow/tfjs-backend-cpu`
 * (or no static import at all, in the wasm case) still leave tfjs
 * with the matrix-selected backend active by the time `beforeAll`
 * runs `await tf.setBackend(TEST_BACKEND)`.
 *
 * Without this hook the `wasm` matrix cell would import
 * `@tensorflow/tfjs-backend-cpu` (every tfjs test file does so at
 * module top), making cpu the default-active backend and forcing
 * test bodies to flip the active backend manually mid-run.
 */
import * as tf from '@tensorflow/tfjs-core';
import { TEST_BACKEND } from './tfjsBackend.js';

async function activate(): Promise<void> {
  if (TEST_BACKEND === 'wasm') {
    await import('@tensorflow/tfjs-backend-wasm');
  } else {
    await import('@tensorflow/tfjs-backend-cpu');
  }
  await tf.setBackend(TEST_BACKEND);
  await tf.ready();
}

await activate();
