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
// Vue SFC support (`*.vue` parser) is added by the first pillar that
// introduces a `.vue` file. Until then the `*.vue` glob simply matches
// nothing.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
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
      'src/main.ts',
      'src/seed.ts',
      'src/ui.ts',
      'src/traceView.ts',
      'src/lossSparkline.ts',
      'src/predictionStrip.ts',
      'src/speciesConfig.ts',
      'src/species.ts',
      'src/cognitionSwitcher.ts',
      'src/constants.ts',
      'src/cognition/**',
      'src/skills/**',
    ],
  },
  js.configs.recommended,
  // Type-aware rules use the demo workspace's tsconfig.
  ...tseslint.configs.recommended,
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
  // or demo-domain directly — go through stores/domain.
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
            },
          ],
          patterns: [
            {
              group: ['agentonomous/*'],
              message:
                'Presentation (components/views) must not import agentonomous directly — go through stores/domain.',
            },
            {
              group: [
                '**/demo-domain/**',
                '../demo-domain/**',
                '../../demo-domain/**',
                '../../../demo-domain/**',
              ],
              message:
                'Presentation (components/views) must not import demo-domain/* directly — go through stores/domain.',
            },
          ],
        },
      ],
    },
  },

  // View stores hold UI-only state — read from domain stores only.
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
            },
          ],
          patterns: [
            {
              group: ['agentonomous/*'],
              message:
                'View stores hold UI-only state — read from domain stores, not from agentonomous.',
            },
            {
              group: [
                '**/demo-domain/**',
                '../demo-domain/**',
                '../../demo-domain/**',
                '../../../demo-domain/**',
              ],
              message:
                'View stores must not import demo-domain/* — domain stores own that boundary.',
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

  prettier,
);
