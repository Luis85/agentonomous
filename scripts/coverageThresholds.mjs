/**
 * Single source of truth for the Vitest coverage gate.
 *
 * Both `vite.config.ts` (which configures vitest's `coverage.thresholds`)
 * and `scripts/coverage-pr-comment.mjs` (the sticky PR-comment renderer)
 * import from here. Keeping them in one place avoids the bug where
 * bumping the gate without bumping the drift comparator (or vice versa)
 * silently desyncs the two.
 *
 * **Re-baselining a floor.** When the PR-comment shows ⚠️ (actual ≥
 * `floor + DRIFT_WARN_PP` on some metric), re-run
 * `npm run test:coverage`, read the new percentages from
 * `coverage/coverage-summary.json`, and set each floor to
 * `floor(measured − 2)` (so routine PRs don't trip the gate but a
 * coverage regression beyond ~2pp fails the build). Update the
 * **Baseline** comment below with the new measurements + the commit
 * SHA they were taken at, in the same PR.
 */

/**
 * Floor percentages for each v8 coverage metric. Vitest fails the build
 * if any actual percentage drops below the corresponding floor.
 *
 * **Baseline 2026-04-25 (commit f6e4464):** statements 76.22 / branches
 * 66.61 / functions 85.42 / lines 77.78. Floors set at
 * `floor(measured − 2)`.
 */
export const COVERAGE_THRESHOLDS = Object.freeze({
  statements: 74,
  branches: 64,
  functions: 83,
  lines: 75,
});

/**
 * Drift envelope (in percentage points) used by
 * `scripts/coverage-pr-comment.mjs`. When `actual − floor` exceeds this
 * value on any metric, the sticky PR comment marks that metric ⚠️ with
 * "consider re-baselining". Advisory only — the actual regression gate
 * is the floors above (vitest fails the build when actual < floor).
 *
 * 5pp is the empirical headroom we tolerate before a floor drifts far
 * enough from reality that a sizeable regression could slip through. A
 * stricter value (e.g. 3pp) produces too many warnings; looser (e.g.
 * 10pp) defeats the purpose of the check.
 */
export const DRIFT_WARN_PP = 5;
