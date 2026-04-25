import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import dts from 'vite-plugin-dts';

// Library mode build. Entries:
// - main:        src/index.ts                        → dist/index.js
// - excalibur:   src/integrations/excalibur/index.ts → dist/integrations/excalibur/index.js
// - mistreevous: src/cognition/adapters/mistreevous/index.ts
//                                                    → dist/cognition/adapters/mistreevous/index.js
// - js-son:      src/cognition/adapters/js-son/index.ts
//                                                    → dist/cognition/adapters/js-son/index.js
// - tfjs:        src/cognition/adapters/tfjs/index.ts
//                                                    → dist/cognition/adapters/tfjs/index.js
//
// All peer dependencies are marked external so consumers provide them.

// Loose ambient `.d.ts` shims that vite-plugin-dts does not process
// (it only emits declarations for `.ts` sources it compiles). For each
// entry: copy the shim into `dist/` and prepend a `/// <reference>`
// line to the listed emitted `.d.ts` files so consumers pick up the
// ambient module declaration automatically when importing the subpath.
type AmbientDtsEntry = {
  /** Shim source path, relative to project root. */
  from: string;
  /** Shim destination path, relative to project root. */
  to: string;
  /**
   * Emitted `.d.ts` files (relative to project root) that need a
   * triple-slash reference to the shim prepended so TS resolves the
   * ambient declaration when consuming the subpath.
   */
  referencedBy: string[];
};

const ambientDtsEntries: AmbientDtsEntry[] = [
  {
    from: 'src/cognition/adapters/js-son/js-son-agent.d.ts',
    to: 'dist/cognition/adapters/js-son/js-son-agent.d.ts',
    referencedBy: [
      'dist/cognition/adapters/js-son/index.d.ts',
      'dist/cognition/adapters/js-son/JsSonReasoner.d.ts',
    ],
  },
];

function copyAmbientDts(): Plugin {
  return {
    name: 'agentonomous:copy-ambient-dts',
    apply: 'build',
    closeBundle() {
      for (const entry of ambientDtsEntries) {
        const src = resolve(__dirname, entry.from);
        const dest = resolve(__dirname, entry.to);
        mkdirSync(resolve(dest, '..'), { recursive: true });
        copyFileSync(src, dest);
        for (const ref of entry.referencedBy) {
          const refAbs = resolve(__dirname, ref);
          const relPath = relative(resolve(refAbs, '..'), dest).replace(/\\/g, '/');
          const prefixedPath = relPath.startsWith('.') ? relPath : `./${relPath}`;
          const directive = `/// <reference path="${prefixedPath}" />\n`;
          const current = readFileSync(refAbs, 'utf8');
          if (current.startsWith(directive)) continue;
          writeFileSync(refAbs, directive + current);
        }
      }
    },
  };
}

const externalPackages = [
  '@anthropic-ai/sdk',
  '@tensorflow/tfjs-core',
  '@tensorflow/tfjs-layers',
  'excalibur',
  'js-son-agent',
  'mistreevous',
  'openai',
  'sim-ecs',
];

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'integrations/excalibur/index': resolve(__dirname, 'src/integrations/excalibur/index.ts'),
        'cognition/adapters/mistreevous/index': resolve(
          __dirname,
          'src/cognition/adapters/mistreevous/index.ts',
        ),
        'cognition/adapters/js-son/index': resolve(
          __dirname,
          'src/cognition/adapters/js-son/index.ts',
        ),
        'cognition/adapters/tfjs/index': resolve(__dirname, 'src/cognition/adapters/tfjs/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: (id) => externalPackages.some((pkg) => id === pkg || id.startsWith(`${pkg}/`)),
      output: {
        preserveModules: false,
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
  plugins: [
    dts({
      tsconfigPath: './tsconfig.build.json',
      entryRoot: 'src',
      outDir: 'dist',
      staticImport: true,
      rollupTypes: false,
      insertTypesEntry: true,
    }),
    copyAmbientDts(),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Resolve `agentonomous` + its adapter subpaths against `src/` at test
    // time. Without this, vitest hits the root `package.json` exports
    // map (→ `./dist/*`), which requires a prior `npm run build` — but
    // CI runs tests *before* build (and `npm run verify` runs them in
    // that order locally too). The demo files in `examples/nurture-pet/`
    // intentionally import from `agentonomous` + its subpaths so they
    // stay consumer-realistic; the alias keeps the tests that exercise
    // those demo files working without a build artifact dependency.
    alias: [
      {
        find: /^agentonomous\/cognition\/adapters\/mistreevous$/,
        replacement: resolve(__dirname, 'src/cognition/adapters/mistreevous/index.ts'),
      },
      {
        find: /^agentonomous\/cognition\/adapters\/js-son$/,
        replacement: resolve(__dirname, 'src/cognition/adapters/js-son/index.ts'),
      },
      {
        find: /^agentonomous\/cognition\/adapters\/tfjs$/,
        replacement: resolve(__dirname, 'src/cognition/adapters/tfjs/index.ts'),
      },
      {
        find: /^agentonomous$/,
        replacement: resolve(__dirname, 'src/index.ts'),
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/**/*.d.ts'],
    },
  },
});
