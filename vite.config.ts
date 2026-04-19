import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

// Library mode build. Entries:
// - main:        src/index.ts                        → dist/index.js
// - excalibur:   src/integrations/excalibur/index.ts → dist/integrations/excalibur/index.js
// - mistreevous: src/cognition/adapters/mistreevous/index.ts
//                                                    → dist/cognition/adapters/mistreevous/index.js
//
// All peer dependencies are marked external so consumers provide them.

const externalPackages = [
  '@anthropic-ai/sdk',
  'brain.js',
  'excalibur',
  'js-son-agent',
  'mistreevous',
  'openai',
  'sim-ecs',
  'gray-matter',
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
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/**/*.d.ts'],
    },
  },
});
