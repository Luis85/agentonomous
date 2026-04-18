// ESLint 9 flat config.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'docs',
      'examples',
      'schema',
    ],
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
      // Determinism rules (plan §Time & tick contract).
      // Library code must never reach for global non-deterministic sources directly.
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
      ],

      // Minor style nudges that strict rules miss.
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
  // Tests and examples get to touch globals directly.
  {
    files: ['tests/**/*.ts', 'examples/**/*.ts', '**/*.config.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  // Allow Date/Math.random inside the concrete system port adapters.
  {
    files: ['src/ports/SystemClock.ts', 'src/ports/SeededRng.ts', 'src/ports/ConsoleLogger.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  prettier,
);
