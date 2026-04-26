/**
 * Type declarations for `coverageThresholds.mjs`. Imported by
 * `vite.config.ts` (and by anything else that wants type-checked
 * references to the floors), so TS sees concrete types instead of
 * `any` for the ESM constants.
 */
export const COVERAGE_THRESHOLDS: Readonly<{
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}>;

export const DRIFT_WARN_PP: number;
