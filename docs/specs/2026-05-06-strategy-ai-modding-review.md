# 2026-05-06 Strategy AI Modding Review

## Scope

- Repository review focused on architecture, determinism, verification gates, and documentation coherence.
- External research, with emphasis on Anbeeld's article and modern strategy-game AI practice.

## External research highlights

### Key takeaways from Anbeeld

1. **Data accessibility is the hard cap**: better AI logic is impossible when the runtime cannot expose needed world signals.
2. **Quantization + staged updates** are practical for large strategy simulations where full utility scoring every tick is too expensive.
3. **Cross-subsystem coherence beats local optimization**: economy, military, and diplomacy need a shared strategic frame.
4. **Determinism and main-thread budgets** are first-class constraints for lockstep simulation.

Source: https://anbeeld.com/articles/designing-ai-for-strategy-games-through-modding

### Corroborating patterns from other sources

- **Behavior-tree maintenance debt is real**; teams need guardrails for tree size, naming, and composability (GDC AI Arborist).
- **Deterministic lockstep requires strict reproducibility** and often fixed-step thinking for simulation-critical loops.
- **Utility-style scoring remains common**, but only where data access and scoring surfaces are tractable.

## Findings (repo)

### 1) Quickstart still implies npm install flow before publish

`README.md` says the package is pre-v1 and not on npm, but the quickstart immediately presents `npm install agentonomous`, which can mislead first-time users evaluating the repo before publication.

**Risk:** onboarding friction and false-negative first impression (“install is broken”).

**Action:** replace the install snippet with a local-link flow until first publish, then move npm install to a “post-publish” section.

### 2) No explicit performance regression gate in verify pipeline

The project strongly enforces determinism and correctness, but `verify` does not include any budgeted performance check for the core tick loop.

**Risk:** slowdowns can land while tests remain green, especially as cognition and adapters evolve.

**Action:** add a deterministic micro-benchmark CI check (fixed seed + fixed scenario + max wall-time threshold, with variance tolerance) and fail on meaningful regressions.

### 3) Node version policy is documented, but not strictly pinned in CI-facing workflow docs

`CLAUDE.md` states Node 22 as operational baseline, but docs do not prominently assert that all performance and determinism baselines are only valid on Node 22.x.

**Risk:** contributors compare local results across Node majors and misinterpret noise as regressions.

**Action:** add explicit “baseline runtime matrix” language in contributing docs and include Node version in benchmark/replay output metadata.

## Recommended architecture patterns to adopt next

1. **Shared strategic intent surface**
   - Add a lightweight “strategic blackboard” object persisted in snapshot/trace so economy/needs/mood/cognition layers consume one coherent strategic state.
2. **Budget-aware decision cadence**
   - Introduce explicit cadences per subsystem (per tick, every N ticks, on-threshold-crossing), with trace fields that explain skipped evaluations.
3. **Failure-mode-driven test matrix**
   - Keep deterministic replay tests, plus targeted scenarios for known strategy failures: stagnation, starvation loops, overreaction, and stalled recovery.
4. **Observability for AI quality, not just correctness**
   - Add quality KPIs (e.g., unmet-needs area under curve, recovery time, action diversity, stall percentage) as deterministic post-run metrics.

## Suggested near-term implementation plan

1. Fix README pre-publish quickstart section.
2. Add a new `npm run perf:tick-baseline` script and CI job with tolerant thresholds.
3. Extend determinism replay output with runtime metadata (Node version, OS, adapter mode).
4. Add one “cross-subsystem coherence” integration test where a single strategic pivot propagates into multiple subsystems.
