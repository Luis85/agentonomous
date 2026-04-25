/**
 * One-shot seed script for `examples/nurture-pet/src/cognition/learning.network.json`.
 *
 * Builds a `[5, 16, 7]` Sequential (5 need-level inputs → 16 sigmoid hidden →
 * 7 softmax outputs over the active-care skills), trains it briefly on a
 * hand-crafted dataset that maps each lowest-level need to its corresponding
 * skill, and writes the resulting plain-JSON snapshot — matching the
 * `TfjsSnapshot` shape that `TfjsReasoner.fromJSON(...)` rebuilds — to disk.
 *
 * The output mapping is deliberate — the bundled baseline should give an
 * untrained user a network that already "knows" the obvious heuristic
 * (`feed` when hungry, `clean` when dirty, etc.) so the demo's first-load
 * behavior is sensible, while the Train button still produces observable
 * weight drift via the synthetic dataset in `cognitionSwitcher.ts`.
 *
 * Determinism: every RNG draw flows through a fixed-seed LCG and through
 * `model.fit({ shuffle: false })`. Re-running the script on the same node
 * version + tfjs minor version yields a byte-identical JSON file.
 *
 * Self-contained on purpose: rather than importing the library's
 * `TfjsReasoner` (which would force the script to chase rebuilt `dist/`
 * paths or run inside the TS toolchain), we encode the snapshot inline
 * using the same `encodeWeights` byte layout the adapter expects. The
 * format contract lives in `src/cognition/adapters/tfjs/TfjsSnapshot.ts`;
 * keep the two in sync if the snapshot shape ever changes.
 *
 * Usage (one-shot, NOT wired into `verify`):
 *
 * ```
 * node --experimental-strip-types scripts/seed-learning-network.ts
 * ```
 */
import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs-core';
import { initializers, layers, sequential, type Sequential } from '@tensorflow/tfjs-layers';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Active-care skill ids — must match `SOFTMAX_SKILL_IDS` in `learning.ts`. */
const SKILL_IDS = ['feed', 'clean', 'play', 'rest', 'pet', 'medicate', 'scold'] as const;

/** Need-level feature index → skill index for the "lowest need" rule. */
const NEED_TO_SKILL_INDEX: ReadonlyArray<number> = [
  0, // hunger      → feed
  1, // cleanliness → clean
  2, // happiness   → play
  3, // energy      → rest
  5, // health      → medicate
];

/** LCG seed used for both training-pair generation and tfjs init. */
const SEED = 0x5eed_17;

/** Hand-crafted training pair count. */
const PAIR_COUNT = 200;

/** Brief warm-up training run. */
const EPOCHS = 50;

/** Minimal LCG matching the adapter's pattern. */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * Concatenate weight tensors into one base64-encoded `Float32Array` byte
 * payload. Mirrors `encodeWeights` in
 * `src/cognition/adapters/tfjs/TfjsSnapshot.ts`. Inlined so the script
 * stays self-contained and doesn't depend on a built `dist/`.
 */
function encodeWeights(weights: readonly Float32Array[]): string {
  let totalLength = 0;
  for (const w of weights) totalLength += w.length;
  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const w of weights) {
    combined.set(w, offset);
    offset += w.length;
  }
  const bytes = new Uint8Array(combined.buffer);
  return Buffer.from(bytes).toString('base64');
}

/**
 * Build a `[5, 16, 7]` Sequential with sigmoid hidden + softmax output.
 * The kernel initializer is seeded so the pre-train weights are stable;
 * post-train weights then depend only on the deterministic data + fit
 * loop.
 */
function buildModel(): Sequential {
  const model = sequential();
  // `glorotNormal` defaults to an unseeded `Math.random()` draw —
  // running this script repeatedly would produce different baselines
  // even with the data + fit loop seeded. Pass an explicit seed per
  // layer so regeneration is byte-stable.
  model.add(
    layers.dense({
      units: 16,
      activation: 'sigmoid',
      inputShape: [5],
      kernelInitializer: initializers.glorotNormal({ seed: SEED }),
      biasInitializer: 'zeros',
    }),
  );
  model.add(
    layers.dense({
      units: SKILL_IDS.length,
      activation: 'softmax',
      kernelInitializer: initializers.glorotNormal({ seed: SEED + 1 }),
      biasInitializer: 'zeros',
    }),
  );
  model.compile({
    optimizer: tf.train.sgd(0.5),
    loss: 'categoricalCrossentropy',
  });
  return model;
}

/**
 * Generate `(features, oneHotLabel)` pairs that map low need-levels to
 * their corresponding skill. We sample 5 random need levels, find the
 * minimum, and label one-hot at the matching skill index — this is the
 * same rule `featuresToOneHotLabel` uses in `cognitionSwitcher.ts`, just
 * driven by a seeded RNG here so the bundled baseline is reproducible.
 *
 * `pet` and `scold` are reinforced via dedicated archetypes (high-need
 * states with one specific dimension low → the corresponding skill)
 * because the lowest-need rule alone never produces them. Without these
 * the softmax output for those two skills would never see a positive
 * gradient and the baseline would always sit near zero on those columns.
 */
function generateTrainingPairs(rng: () => number): {
  features: number[][];
  labels: number[][];
} {
  const features: number[][] = [];
  const labels: number[][] = [];
  for (let i = 0; i < PAIR_COUNT; i++) {
    const archetype = i % 7;
    const sample: number[] = [rng(), rng(), rng(), rng(), rng()];
    let skillIdx: number;
    if (archetype === 5) {
      // `pet` archetype: all needs comfortably high → reward bonding.
      for (let j = 0; j < 5; j++) sample[j] = 0.7 + rng() * 0.3;
      skillIdx = 4; // pet
    } else if (archetype === 6) {
      // `scold` archetype: happiness very high (over-stimulated) +
      // energy moderately low (jittery). Treat as the "needs a
      // boundary" state.
      sample[2] = 0.85 + rng() * 0.15;
      sample[3] = 0.2 + rng() * 0.2;
      skillIdx = 6; // scold
    } else {
      // Standard archetypes 0..4: lowest-need rule.
      let minIdx = 0;
      let minVal = sample[0]!;
      for (let j = 1; j < 5; j++) {
        const v = sample[j]!;
        if (v < minVal) {
          minVal = v;
          minIdx = j;
        }
      }
      const mapped = NEED_TO_SKILL_INDEX[minIdx];
      skillIdx = mapped ?? 0;
    }
    const oneHot = new Array<number>(SKILL_IDS.length).fill(0);
    oneHot[skillIdx] = 1;
    features.push(sample);
    labels.push(oneHot);
  }
  return { features, labels };
}

async function main(): Promise<void> {
  await tf.setBackend('cpu');
  await tf.ready();

  const rng = makeLcg(SEED);
  const model = buildModel();
  const { features, labels } = generateTrainingPairs(rng);

  console.log(
    `Training [5, 16, ${SKILL_IDS.length}] softmax baseline on ${features.length} pairs ` +
      `for ${EPOCHS} epochs (CPU backend)…`,
  );

  const x = tf.tensor2d(features);
  const y = tf.tensor2d(labels);
  try {
    const history = await model.fit(x, y, {
      epochs: EPOCHS,
      batchSize: 32,
      shuffle: false,
      verbose: 0,
    });
    const lossHistory = history.history.loss as number[];
    console.log(
      `done — initial loss ${lossHistory[0]?.toFixed(3)} → ` +
        `final loss ${lossHistory[lossHistory.length - 1]?.toFixed(3)}`,
    );
  } finally {
    x.dispose();
    y.dispose();
  }

  // Encode the snapshot in the same shape `TfjsReasoner.toJSON()` produces.
  // Cf. src/cognition/adapters/tfjs/TfjsReasoner.ts → toJSON.
  const weightTensors = model.getWeights();
  const weightsShapes = weightTensors.map((t) => [...t.shape]);
  const weightsArrays = weightTensors.map((t) => {
    const data = t.dataSync();
    return data instanceof Float32Array ? data : new Float32Array(data);
  });
  const topology = (model as unknown as { toJSON(unused: unknown, ret: boolean): unknown }).toJSON(
    null,
    false,
  );
  const snapshot = {
    version: 1,
    topology,
    weights: encodeWeights(weightsArrays),
    weightsShapes,
    inputKeys: ['hunger', 'cleanliness', 'happiness', 'energy', 'health'],
    outputKeys: [...SKILL_IDS],
  };

  const here = fileURLToPath(import.meta.url);
  const outPath = resolve(
    here,
    '..',
    '..',
    'examples',
    'nurture-pet',
    'src',
    'cognition',
    'learning.network.json',
  );
  writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Wrote baseline → ${outPath}`);
}

await main();
