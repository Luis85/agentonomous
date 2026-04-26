# Codebase review — findings & actionable plan (2026-04-24)

Comprehensive review of the `agentonomous` codebase on 2026-04-24. Each
finding is paired with a severity, file:line reference, and a concrete
follow-up action. Track A (this PR) lands the guardrails that enforce
the patterns the review found; Tracks B–E are follow-up PRs, one topic
branch each per CLAUDE.md §Non-negotiables.

> **Scope note.** Three review agents ran in parallel: (1) `src/` code
> quality & determinism, (2) tests + tooling configs, (3) docs/markdown
> staleness. An independent pass ran the full verify gate and surveyed
> LOC distribution. This document consolidates all four.

## Verify gate (baseline)

As of this PR (after the lint ratchet + extractions in Track A):

- `format:check` → clean
- `lint` → 0 errors; the residual warnings are the ratchet targets
  documented under Track C
- `typecheck` → clean (strict + `exactOptionalPropertyTypes` +
  `noUncheckedIndexedAccess`)
- `test` → all green
- `build` → clean; every entry point under its `size-limit` budget
  (per-entry caps live in `package.json`)
- `docs` → typedoc generates `docs/api/` from all five public entry
  points, 0 errors

> Note on metrics in docs: counts like "N tests", "M files",
> "X KB gzip" go stale fast and rot with every PR. This doc and the
> review findings deliberately point at the source of truth (the
> CI logs, the `size-limit` config) rather than baking specific
> numbers into prose.

Overall the codebase is **exceptionally disciplined**: determinism is
fully enforced, no default exports, no enums, no `any`, and all Skills
return `Result<T, E>`. The findings below are mostly stale docs,
guardrails the repo relied on as convention, and ratchet opportunities.

---

## Track A — Guardrails (this PR)

Lands live in the project. Zero existing code fails.

### A1. Architectural ESLint rules (`eslint.config.js`)

Previously enforced by convention only; now enforced by CI:

- **`ExportDefaultDeclaration` banned** — matches CLAUDE.md "No default
  exports". Config files (`*.config.{js,ts}`, `eslint.config.js`) carve
  out.
- **`TSEnumDeclaration` banned** — matches STYLE_GUIDE.md "No enums —
  `as const` unions instead".
- **`no-restricted-imports`** (core-only, excluding adapter/port
  folders): `excalibur`, `@tensorflow/*`, `js-son-agent`, `mistreevous`,
  `@anthropic-ai/sdk`, `openai`, `sim-ecs`. Keeps the engine-agnostic
  core from accidentally taking a peer dep.

### A2. Complexity & size limits (`eslint.config.js`)

Caps that keep files agent-navigable. Thresholds chosen so current code
passes clean as error-level; tighter limits tracked under Track C.

| Rule                    | Level | Threshold             |
| ----------------------- | ----- | --------------------- |
| `max-lines`             | error | 1000 (skip blank/cmt) |
| `max-lines-per-function`| warn  | 150                   |
| `complexity`            | warn  | 15                    |
| `max-depth`             | warn  | 4                     |
| `max-params`            | warn  | 5                     |
| `max-nested-callbacks`  | warn  | 3                     |

### A3. Quality rules (`eslint.config.js`)

- `no-console` (error, allow `warn`/`error`) — library uses Logger port
- `no-debugger`, `no-var`, `prefer-const`, `eqeqeq`,
  `no-throw-literal`, `no-duplicate-imports`, `no-unneeded-ternary`,
  `object-shorthand` — error
- `@typescript-eslint/no-explicit-any` — error
- `@typescript-eslint/no-non-null-assertion` — **warn** (kept lenient
  because `noUncheckedIndexedAccess: true` makes bounded-loop `!` the
  idiomatic narrowing)
- `@typescript-eslint/switch-exhaustiveness-check` — error, with
  `allowDefaultCaseForExhaustiveSwitch: true`

### A4. Duplicate-import cleanups

Consolidated three `import` + `import type` pairs into a single inline
`type` form. No behaviour change. Required by the new
`no-duplicate-imports` rule.

### A6. Agent.ts extractions (avoid the per-file LOC override)

`Agent.ts` was the one file over the new `max-lines: 350` cap. To
reduce the override rather than just hiding behind it, three
self-contained methods were extracted into focused helpers under
`src/agent/internal/`:

- `restore()` → `RestoreCoordinator.ts` (`runRestore`)
- `die()` → `DeathCoordinator.ts` (`runDeath`)
- `snapshot()` → `SnapshotAssembler.ts` (`assembleSnapshot`)

Plus a small `applyLifecycleSnapshot()` method on Agent so the
coordinator never reaches into protected fields, and the duplicated
`isInMemoryMemoryAdapter` typeguard moved next to the class it
guards (`src/memory/InMemoryMemoryAdapter.ts`).

Result: Agent.ts dropped ~110 effective LOC (562 → 484). A per-file
`max-lines: 500` override remains until `tick()` itself is split
(Track C2 below). The cap is tighter than a global lift would be and
makes the legacy outlier visible in CI.

### A7. Express skill consolidation (D1)

Three near-identical 24-line skills (`ExpressMeowSkill`,
`ExpressSadSkill`, `ExpressSleepySkill`) collapsed onto a single
`createExpressionSkill(id, label, expression, fxHint)` factory in
`src/skills/defaults/ExpressionSkill.ts`. The three exports now stay
as one-line declarations, eliminating ~50 lines of boilerplate. No
caller-visible change.

### A8. Stale-prone metrics removed from prose

Counts like "~300 tests" (in CLAUDE.md), "10 default skills"
(README.md, CLAUDE.md, `docs/specs/vision.md`), and "~80 KB
unminified ESM" (README.md) replaced with descriptive phrasing or
pointers to the source of truth (`size-limit` config, CI logs).
These metrics had drifted (the test count was already 50% off) and
will drift again — best not to bake them into docs.

### A5. Typedoc wired into CI

- Added adapter entry points: `mistreevous`, `js-son`, `tfjs` (all three
  were in `package.json#exports` but missing from `typedoc.json`, so
  they never appeared in generated API docs).
- Added `docs/` step to `.github/workflows/ci.yml` as a parallel static
  check alongside format/lint/typecheck/actionlint. Test job now depends
  on `docs` too.
- Added `npm run docs` to the `verify` script (local gate mirrors CI).
- Output still goes to `docs/api/` (already in `.gitignore:4`, sits
  alongside `how-to/`, `plans/`, `specs/`).
- Uploaded as an artifact (`api-docs`, 14-day retention) so reviewers
  can download it per CI run.

---

## Track B — Stale documentation (next PR)

Topic branch: `docs/codebase-review-fixups`

### B1. `README.md:7` — pre-release version claim out of sync

> README says `Status: pre-release (0.1.0)` but `package.json:3` is
> `"version": "0.0.0"`. Either bump the package or drop the `(0.1.0)`
> qualifier.

Action: strike the `(0.1.0)` until the first real release; mention that
the package is **not yet on npm** in the Quickstart.

### B2. `README.md` — Quickstart shows `npm install agentonomous` but
package is never published

Action: prepend a banner/note ("pre-v1, not yet published — use
`file:` or `link:` for local eval") or hide the install step behind a
`<details>` until published.

### B3. `CLAUDE.md:46` — test count stale ("~300")

The `npm test` line in CLAUDE.md included a hard-coded count that
was already off by ~50%. Track A drops the number entirely — counts
like this go stale every PR. The same pattern is corrected for "10
default skills" in CLAUDE.md / README.md / `docs/specs/vision.md`
(replaced with "a default bundle").

### B4. `docs/plans/2026-04-24-polish-and-harden.md:9` — broken
`MEMORY.md` reference

The plan references `MEMORY.md → project_v1_release_hold.md` but
`MEMORY.md` does not exist in the repo. Action: either add the memory
file, move the release-hold note inline, or delete the dangling link.

### B5. `docs/plans/2026-04-24-polish-and-harden.md:64-68` — remediation
items 1/3/4 marked "Not started" but already merged

- Item #1 (modifier restore) → commit `8cc4ea0` (PR #71) ✅
- Item #3 (pickDefaultSnapshotStore throwing localStorage getter) →
  commit `0752623` (PR #73) ✅
- Item #4 (FsSnapshotStore deterministic list order) → commit `be0cdf0`
  (PR #74) ✅

Action: update the status column. This is the kind of drift that's
worst for agents — they'll re-do work that's already shipped.

### B6. `CONTRIBUTING.md:111` — `R<xx>` commit convention unused

No recent commit uses the `R<xx>` prefix; commits use `fix(scope):` /
`feat(scope):`. Action: either adopt the convention or remove the
claim.

### B7. `.changeset/` — 29 accumulated changesets; version still 0.0.0

Five days of work is pending a first release. Action: either bump the
version and consume the pile, or document in CLAUDE.md that the hold
is intentional and why. Currently changesets aren't actionable until
the hold lifts.

### B8. `.changeset/config.json:8` — `baseBranch: "main"` but PRs target
`develop`

CLAUDE.md §Non-negotiables mandates all PRs target `develop`, yet
changesets' base branch is `main`. This means the changeset bot's
"changed files since base" logic may undercount on PRs targeting
`develop`. Action: flip to `"develop"` (or add a rationale comment if
`main` was deliberate for release-only counting).

### B9. `vite.config.ts:75` — stale `gray-matter` external

`externalPackages` lists `gray-matter` but it's neither in
`package.json` dependencies nor imported anywhere. Dead entry — remove.

---

## Track C — Ratchet targets (tracked)

Topic branches per item; each its own PR. The 11 lint warnings are the
menu.

### C1. `src/agent/createAgent.ts:161` — cyclomatic complexity 59

Huge outlier. Action: extract per-subsystem resolvers (already partly
done via `resolveLifecycle`, `resolveNeeds`, `resolveMoodModel`, etc.)
into a `buildAgentDeps()` composition that reduces the top-level
factory to a flat assembly.

### C2. `src/agent/Agent.ts` — constructor (23), `tick` (21),
`restore` (25) — all above complexity 15

Action: the Ticker/Reconciler split under `internal/` is the right
scaffold; push more of the branching down into those helpers. Aim for
each top-level method to orchestrate, not decide.

### C3. `src/agent/Agent.ts` — 948 lines

Approaches the 1000-line `max-lines` error cap. Action: pull
`restore()`/`catchUp` into `src/agent/internal/RestoreCoordinator.ts`;
pull snapshot assembly into `src/agent/internal/SnapshotAssembler.ts`.
Plan to ratchet `max-lines` down to 600.

### C4. `src/ports/MockLlmProvider.ts:82` — `completeSync` complexity 25

Action: split queue-mode vs match-or-error strategies into two
functions; the single 80-line body mixes both.

### C5. `src/cognition/personaBias.ts:22` — arrow complexity 16

Action: extract inner weight calculation as a named helper so the main
arrow becomes a map over scored candidates.

### C6. Non-null assertions — four sites

`TfjsReasoner.ts:34` (shuffle), `TfjsSnapshot.ts:45` (byte copy),
`MockLlmProvider.ts:166,173` (post-length-check). All idiomatic under
`noUncheckedIndexedAccess`. Action: consider rewriting as `for…of`
(eliminates the index-access narrowing) or wrap in a `assertDefined`
helper for documentation value. Not urgent.

---

## Track D — Source-code micro-findings

Collected by the `src/` review agent. Each is `<= 10-minute` sized.

### D1. Express skills — 3 near-identical files (~65 lines of
duplication)

`src/skills/defaults/ExpressMeowSkill.ts`,
`ExpressSadSkill.ts`, `ExpressSleepySkill.ts` differ only in expression
type, `fxHint`, and event constant. Action: extract
`createExpressionSkill(id, label, expression, fxHint)` helper.

### D2. `src/agent/result.ts:14-37` — no JSDoc on `isOk`, `isErr`,
`map`, `mapErr`, `andThen`, `unwrap`

STYLE_GUIDE.md mandates JSDoc on exported symbols. Action: add
one-sentence JSDoc to each (they're used widely in skills).

### D3. `src/cognition/IntentionCandidate.ts` — `discriminant` field
lacks semantic JSDoc

Unclear from the shape whether it's `[0, 1]`, signed, etc. Action: one
line describing the valid range and the tie-break intent.

### D4. `src/skills/SkillRegistry.ts` — `invoke()` JSDoc doesn't say
"throws on unregistered" vs "returns err()"

Actual code throws (correct per infra-error policy), but the JSDoc is
ambiguous. Action: add `@throws` clause.

### D5. `src/agent/internal/CognitionPipeline.ts:49-63` — no exhaustive
`_exhaust: never` check on `ControlMode` switch

Now that `switch-exhaustiveness-check` is enforced as an ESLint rule
(A3), this is already guarded — but a `default: { const _x: never =
agent.controlMode; throw … }` inside the default branch matches the
pattern STYLE_GUIDE.md:32-34 documents. Low priority now.

---

## Track E — Tooling gaps

### E1. `vitest` coverage has no thresholds

`vite.config.ts:156-161` sets up the reporter but doesn't enforce
`thresholds: { lines, functions, branches, statements }`. CI runs
coverage (`test:coverage`) but a drop in coverage wouldn't fail. Action:
add thresholds at current baseline (measure, then set at -2% floor).

### E2. Peer deps pinned at `*`

`package.json:117,123,124,120` — `@anthropic-ai/sdk`,
`openai`, `sim-ecs`, `excalibur` all declare `"*"`. Allowing any major
version is risky for consumers. Action: pin minimums (e.g. `>=2.0.0`
for excalibur `^0.32`, `^4.0.0` for Anthropic SDK, etc.).

### E3. Skill defaults have no per-skill tests

Every default skill shares one grouped test file
(`tests/unit/skills/defaults.test.ts`). Grouped is fine for
effectiveness tables, but per-skill behaviour (events emitted, edge
cases) is thin. Action: consider splitting as each skill gains
specific logic.

### E4. 86 src files without unit tests

Mostly types/barrels/ports — acceptable. Notable gaps: port interfaces
that could use round-trip tests, adapter barrels with no smoke imports.
Action: review the list, tag the ones that warrant tests.

---

## Post-merge workflow reminder

Per CLAUDE.md §Non-negotiables, each of Tracks B, C, D, E should be its
**own topic branch cut from `develop`**, not stacked on this branch.
Splitting after the fact means cherry-picking and three parallel review
cycles. When in doubt, one concern ↔ one branch ↔ one PR.

## Source list

- Three parallel review agents (src code, tests+config, docs).
- Local `npm run verify` — format/lint/typecheck/test/build/docs.
- Independent LOC & pattern surveys (grep-based).
- Git log since 2026-04-15.

_First-commit date of this plan: 2026-04-24._
