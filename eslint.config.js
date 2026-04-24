// ESLint 9 flat config.
//
// Rule categories:
//   1. Determinism        — forbid non-deterministic globals in library code.
//   2. Architecture       — enforce the module boundaries declared in
//                           CLAUDE.md (no default exports, no enums, no
//                           cross-layer imports into core).
//   3. Complexity & size  — caps that keep files agent-navigable and
//                           catch "God files" before they're reviewed.
//   4. Quality            — rules that raise the baseline for agentic
//                           contributions (no-console, eqeqeq,
//                           switch-exhaustiveness, etc.).
//
// Thresholds are deliberately ratchetable. When a limit would flag an
// existing file, the per-file override at the bottom documents it as
// technical debt with a link to the remediation plan, rather than
// weakening the rule globally.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Path prefixes (POSIX) used to scope architectural restrictions. Keep
// these relative — ESLint resolves `files` patterns relative to the
// config file's directory.
const SRC_CORE = 'src/**/*.ts';
const SRC_ADAPTER_TFJS = 'src/cognition/adapters/tfjs/**/*.ts';
const SRC_ADAPTER_MISTREEVOUS = 'src/cognition/adapters/mistreevous/**/*.ts';
const SRC_ADAPTER_JSSON = 'src/cognition/adapters/js-son/**/*.ts';
const SRC_INTEGRATION_EXCALIBUR = 'src/integrations/excalibur/**/*.ts';
const SRC_PORT_LLM = 'src/ports/{LlmProviderPort,MockLlmProvider}.ts';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'coverage', 'docs', 'examples', 'schema'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'vite.config.ts', '*.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ────────────────────────────────────────────────────────────
      // 1. Determinism (plan §Time & tick contract).
      // ────────────────────────────────────────────────────────────
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message: 'Use WallClock from src/ports instead of the Date global inside library code.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'Use the Rng port from src/ports instead of Math.random inside library code.',
        },
        {
          selector: "CallExpression[callee.name='setTimeout']",
          message: 'Never use setTimeout inside library code; schedule through ports instead.',
        },
        {
          selector: "CallExpression[callee.name='setInterval']",
          message: 'Never use setInterval inside library code; the host drives tick(dt).',
        },
        // ──────────────────────────────────────────────────────────
        // 2. Architecture (CLAUDE.md §Style conventions).
        // ──────────────────────────────────────────────────────────
        {
          selector: 'ExportDefaultDeclaration',
          message:
            'No default exports. Use a named export so the barrel + tree-shaking work predictably.',
        },
        {
          selector: 'TSEnumDeclaration',
          message:
            'No enums — use `as const` object literals with a union type instead (STYLE_GUIDE.md).',
        },
      ],

      // ────────────────────────────────────────────────────────────
      // 3. Complexity & size (agent navigability).
      //
      // Limits are intentionally generous so current code passes
      // clean. Ratcheting targets live in
      // docs/plans/2026-04-24-codebase-review-findings.md.
      // ────────────────────────────────────────────────────────────
      'max-lines': ['error', { max: 350, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'warn',
        { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      complexity: ['warn', 15],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 5],
      'max-nested-callbacks': ['warn', 3],

      // ────────────────────────────────────────────────────────────
      // 4. Quality (defensive defaults for agentic contributions).
      // ────────────────────────────────────────────────────────────
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-throw-literal': 'error',
      'no-duplicate-imports': 'error',
      'no-unneeded-ternary': 'error',
      'object-shorthand': ['error', 'always'],
      '@typescript-eslint/no-explicit-any': 'error',
      // Warn-only: `noUncheckedIndexedAccess: true` means bounded
      // loops and post-length-check array access require a `!` to
      // narrow. Flag for review rather than reject outright.
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { allowDefaultCaseForExhaustiveSwitch: true, considerDefaultExhaustiveForUnions: true },
      ],
      // Determinism: `[].sort()` without a comparator uses
      // locale-dependent UTF-16 ordering. Always pass an explicit
      // comparator (the project does this — this rule locks it in).
      '@typescript-eslint/require-array-sort-compare': ['error', { ignoreStringArrays: false }],
      // Type-safety idioms.
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/prefer-readonly': 'warn',
      // Style nudges.
      'prefer-template': 'error',
      'no-useless-concat': 'error',
      'no-useless-rename': 'error',
      radix: 'error',
      'default-case-last': 'error',
      'no-lonely-if': 'error',

      // ────────────────────────────────────────────────────────────
      // Style nudges that strict rules miss.
      // ────────────────────────────────────────────────────────────
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ────────────────────────────────────────────────────────────────
  // Architectural import boundaries — enforced per file group so
  // peer-optional dependencies stay confined to their adapter folder.
  //
  // Core (src/**) may not import excalibur, tfjs, js-son-agent,
  // mistreevous, or OpenAI/Anthropic SDKs. Each of those lives behind
  // an adapter/port that the core depends on structurally.
  // ────────────────────────────────────────────────────────────────
  {
    files: [SRC_CORE],
    ignores: [
      SRC_ADAPTER_TFJS,
      SRC_ADAPTER_MISTREEVOUS,
      SRC_ADAPTER_JSSON,
      SRC_INTEGRATION_EXCALIBUR,
      SRC_PORT_LLM,
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'excalibur',
              message:
                'Core must not import Excalibur. Use src/integrations/excalibur or keep the type behind a port.',
            },
            {
              name: '@tensorflow/tfjs-core',
              message:
                'Only src/cognition/adapters/tfjs may import @tensorflow/* — the core stays engine-agnostic.',
            },
            {
              name: '@tensorflow/tfjs-layers',
              message:
                'Only src/cognition/adapters/tfjs may import @tensorflow/* — the core stays engine-agnostic.',
            },
            {
              name: 'mistreevous',
              message:
                'Only src/cognition/adapters/mistreevous may import the mistreevous runtime.',
            },
            {
              name: 'js-son-agent',
              message: 'Only src/cognition/adapters/js-son may import the js-son-agent runtime.',
            },
            {
              name: '@anthropic-ai/sdk',
              message:
                'Core must not import the Anthropic SDK. Use LlmProviderPort + an adapter instead.',
            },
            {
              name: 'openai',
              message:
                'Core must not import the OpenAI SDK. Use LlmProviderPort + an adapter instead.',
            },
            {
              name: 'sim-ecs',
              message: 'Core must not import sim-ecs — keep the integration behind an adapter.',
            },
          ],
          patterns: [
            {
              group: ['@tensorflow/*'],
              message: 'Only src/cognition/adapters/tfjs may import @tensorflow/*.',
            },
          ],
        },
      ],
    },
  },

  // ────────────────────────────────────────────────────────────────
  // Per-file size overrides for the one legacy outlier.
  //
  // The global cap is 350. Agent.ts currently sits at ~484 effective
  // LOC; this PR already extracted `restore()`, `die()`, and
  // `snapshot()` into `src/agent/internal/` helpers (saved ~110 LOC).
  // The remaining hotspot is `tick()` (~150 LOC of stage
  // orchestration) — splitting it cleanly is its own focused PR
  // (Track C2 of docs/plans/2026-04-24-codebase-review-findings.md).
  //
  // Cap at 500 here so the file cannot grow further while the split
  // is pending. Drop this override once tick() has been broken out.
  // ────────────────────────────────────────────────────────────────
  {
    files: ['src/agent/Agent.ts'],
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },

  // Tests and examples get to touch globals directly, use console, etc.
  {
    files: ['tests/**/*.ts', 'examples/**/*.ts', '**/*.config.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      complexity: 'off',
      'max-depth': 'off',
      'max-nested-callbacks': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  // Allow Date/Math.random inside the concrete system port adapters.
  {
    files: ['src/ports/SystemClock.ts', 'src/ports/SeededRng.ts', 'src/ports/ConsoleLogger.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
  // Config files themselves must use default export.
  {
    files: ['eslint.config.js', '*.config.ts', '*.config.js'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  prettier,
);
