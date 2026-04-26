// Demo-workspace ESLint flat config.
//
// Purpose: enforce the design's DDD forbidden-import table + the
// determinism rules (spec NFR-D-1) on the layered subpaths the
// pre-v1 demo evolution increment introduces (`components/`,
// `views/`, `demo-domain/`, `stores/view/`, `stores/domain/`). The
// existing product-demo baseline (the original pet-care loop) lives
// flat under `src/` and is intentionally NOT linted by this config —
// pillar 5.2 refactors that code into `demo-domain/scenarios/petCare/`
// and at that point it inherits these rules.
//
// Rules table (mirrors the design doc):
//
// | From               | May not import                                      |
// |--------------------|-----------------------------------------------------|
// | components/**      | agentonomous, demo-domain/**                        |
// | views/**           | agentonomous, demo-domain/** (use stores instead)   |
// | demo-domain/**     | vue, pinia, vue-router, @vueuse/*, anything DOM-aware |
// | stores/view/**     | agentonomous, demo-domain/**                        |
// | demo-domain/**,    | Date / Math.random / setTimeout / setInterval /     |
// | stores/domain/**   | requestAnimationFrame (NFR-D-1)                     |
//
// Vue SFC support: Pillar 1 slice 1.2a wires `vue-eslint-parser` +
// `eslint-plugin-vue` so the placeholder SFCs (`App.vue`, `views/*.vue`,
// `components/shell/AppHeader.vue`) lint cleanly. The first SFCs land
// in this slice; richer Vue rule tuning rides with slice 1.2b's
// chapter-1 vertical when the SFCs gain real templates.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import vuePlugin from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Build artefacts + legacy product-demo source files (the original
    // pet-care loop). The legacy files live flat under `src/` and are
    // intentionally not linted by this config until pillar 5.2 refactors
    // them into `src/demo-domain/scenarios/petCare/`. Listing them here
    // keeps the existing baseline buildable while still enforcing the
    // design's DDD rules on the new layered subpaths (`app/`,
    // `components/`, `views/`, `demo-domain/`, `stores/`).
    ignores: [
      'dist',
      'node_modules',
      'playwright-report',
      'test-results',
      // Legacy vanilla-TS DOM mounts surviving the Wave-0/1.2b transition.
      // Cognition switcher / loss sparkline / prediction strip stay here
      // until Pillar 2 slice 2.5 ports + deletes them; species config
      // stays until Pillar 4 slice 4.3 relocates its pure logic. The
      // 1.2b-deleted files (`main.ts`, `ui.ts`, `traceView.ts`,
      // `seed.ts`) no longer need entries — their logic now lives in
      // SFCs + Pinia stores under `src/{app,components,views,stores}/`.
      'src/lossSparkline.ts',
      'src/predictionStrip.ts',
      'src/speciesConfig.ts',
      'src/cognitionSwitcher.ts',
    ],
  },
  js.configs.recommended,
  // Type-aware rules use the demo workspace's tsconfig.
  ...tseslint.configs.recommended,
  ...vuePlugin.configs['flat/recommended'],
  // Vue SFC parser: `@vue/eslint-parser` reads the `<template>` block and
  // hands `<script>` content to `@typescript-eslint/parser`. Slice 1.2a
  // only ships placeholder SFCs (`App.vue`, `views/*.vue`,
  // `components/shell/AppHeader.vue`), so we keep the recommended rule
  // bundle and let slice 1.2b layer scenario-specific tuning on top.
  {
    files: ['src/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: '@typescript-eslint/parser',
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'vite.config.ts', 'playwright.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        // Mirror the root config's structural rules so the demo workspace
        // doesn't drift on architectural primitives.
        {
          selector: 'ExportDefaultDeclaration',
          message: 'No default exports — keep barrel + tree-shake behaviour predictable.',
        },
        {
          selector: 'TSEnumDeclaration',
          message: 'No enums — use `as const` object literals with a union type instead.',
        },
      ],
    },
  },

  // Presentation layer (components / views): must NOT touch agentonomous
  // or demo-domain directly — go through stores/domain. Type-only imports
  // are allowed (erased at runtime) so components can name shared
  // contracts like `AgentState`, `SelectorHandle`, `WalkthroughStep`
  // without taking a runtime dep on the lower layers.
  {
    files: ['src/components/**/*.{ts,vue}', 'src/views/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'agentonomous',
              message:
                'Presentation (components/views) must not import agentonomous directly — go through stores/domain.',
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: ['agentonomous/*'],
              message:
                'Presentation (components/views) must not import agentonomous directly — go through stores/domain.',
              allowTypeImports: true,
            },
            {
              group: [
                '**/demo-domain/**',
                '../demo-domain/**',
                '../../demo-domain/**',
                '../../../demo-domain/**',
              ],
              message:
                'Presentation (components/views) must not import demo-domain/* directly — go through stores/domain. `import type` is allowed for cross-pillar contract types.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },

  // View stores hold UI-only state — read from domain stores only.
  // Type-only imports from demo-domain are permitted (erased at runtime),
  // so view stores can name the cross-pillar contracts (`WalkthroughStep`,
  // `WalkthroughStepId`, `TourCtx`) without taking a runtime dep on the
  // domain layer. Runtime values flow through composables / domain stores.
  {
    files: ['src/stores/view/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'agentonomous',
              message:
                'View stores hold UI-only state — read from domain stores, not from agentonomous.',
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: ['agentonomous/*'],
              message:
                'View stores hold UI-only state — read from domain stores, not from agentonomous.',
              allowTypeImports: true,
            },
            {
              group: [
                '**/demo-domain/**',
                '../demo-domain/**',
                '../../demo-domain/**',
                '../../../demo-domain/**',
              ],
              message:
                'View stores must not take a runtime import on demo-domain/* — go through a composable. `import type` is allowed for the cross-pillar contracts.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },

  // Pure-TS demo-domain modules — no Vue, no Pinia, no router, no
  // @vueuse/*, no DOM-aware imports.
  {
    files: ['src/demo-domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'vue', message: 'demo-domain is pure TS — no Vue imports.' },
            { name: 'pinia', message: 'demo-domain is pure TS — no Pinia imports.' },
            { name: 'vue-router', message: 'demo-domain is pure TS — no router imports.' },
          ],
          patterns: [
            {
              group: ['@vueuse/*'],
              message: 'demo-domain is pure TS — no @vueuse/* (DOM-aware) imports.',
            },
          ],
        },
      ],
    },
  },

  // Determinism enforcement (spec NFR-D-1) for the demo's domain layers.
  {
    files: ['src/demo-domain/**/*.ts', 'src/stores/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message:
            'demo-domain / stores/domain must source time from the active session’s ManualClock — no raw Date.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'demo-domain / stores/domain must source RNG from the active session’s SeededRng — no raw Math.random.',
        },
        {
          selector: "CallExpression[callee.name='setTimeout']",
          message: 'demo-domain / stores/domain must not schedule via setTimeout (NFR-D-1).',
        },
        {
          selector: "CallExpression[callee.name='setInterval']",
          message: 'demo-domain / stores/domain must not schedule via setInterval (NFR-D-1).',
        },
        {
          selector: "CallExpression[callee.name='requestAnimationFrame']",
          message:
            'demo-domain / stores/domain must update on AGENT_TICKED, not requestAnimationFrame (NFR-D-1).',
        },
      ],
    },
  },

  // Config files themselves use default export — opt them out of the
  // structural rules above. Mirrors the root config.
  {
    files: ['eslint.config.js', '*.config.ts', '*.config.js'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // Vue SFCs compile to a default-exported component object; relax the
  // structural `no-default-export` rule for `*.vue`. The Vue type shim
  // also relies on `export default` to satisfy SFC import semantics.
  {
    files: ['src/**/*.vue', 'src/vue-shims.d.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  prettier,
);
