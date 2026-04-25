# Comprehensive polish + hardening pass — pre-1.0

> Supersedes:
>
> - `docs/plans/2026-04-24-codebase-review-findings.md` (review output)
> - `docs/plans/2026-04-24-polish-and-harden.md` (incremental roadmap)
>
> Both inputs are kept in git history; this doc consolidates them and
> reflects the current shipped state (Track A1 + Track A2 merged).

Pre-1.0 polish + harden pass. The 1.0.0 npm publish is **held** by
owner decision until library + demo polish is complete (see
`MEMORY.md → project_v1_release_hold.md`). Major-bump changesets
continue accumulating on `develop`.

Each row is its own topic branch cut from `develop`, opens one PR,
gets Codex-reviewed, merges independently. **No stacking.** When two
rows touch the same area, cut them separately and rebase the second
after the first merges.

---

## What's already shipped

### A1 — Architectural guardrails (merged via PR #75)

Codebase-review track A landed in develop. Every rule was chosen so
the existing tree passes clean as error-level:

- `eslint.config.js`: `ExportDefaultDeclaration` banned;
  `TSEnumDeclaration` banned; `no-restricted-imports` for peer-only
  packages from core; `max-lines: 1000`; `no-console` (allow
  warn/error); `@typescript-eslint/no-explicit-any` error;
  `switch-exhaustiveness-check` error.
- `Agent.ts` extractions into `internal/RestoreCoordinator.ts`,
  `DeathCoordinator.ts`, `SnapshotAssembler.ts`. ~110 LOC dropped.
- Three express skills (meow / sad / sleepy) collapsed onto
  `createExpressionSkill()` factory.
- Stale-prone counts (`~300 tests`, `10 default skills`,
  `~80 KB unminified`) replaced with descriptive phrasing.
- Typedoc wired into CI; adapter entry points added.

### A2 — Remediation (PRs #71 / #72 / #73 / #74, all merged 2026-04-24/25)

Four persistence/restore correctness fixes from the 2026-04-24 review:

- `Agent.restore()` replaces (not merges) modifier state, gated on
  `snapshot.modifiers` presence so partial-snapshot semantics still
  work.
- `LocalStorageSnapshotStore` keyspace split (`data/` + `meta/`),
  `encodeURIComponent`-encoded user keys, empty-prefix guard,
  lone-surrogate UTF-16 error wrapping.
- `pickDefaultSnapshotStore()` survives a throwing
  `globalThis.localStorage` getter.
- `FsSnapshotStore.list()` returns Unicode code-point sorted keys.

Lessons captured in `MEMORY.md → feedback_prerelease_no_migration.md`:
pre-1.0 PRs ship clean-break shape changes, never compat shims. PR
#72 burned 11 fixups defending against a v1 layout no consumer had on
disk.

### B — 2026-04-25 batch (PRs #76 → #84 + #85, merged 2026-04-25)

The current session shipped 9 rows from this roadmap. The recommended
order (1 → 2 → 5 → 6 → 7 → 8 → 9 → 13 → 14 → 15) was followed
end-to-end, with each PR Codex-reviewed and resolved before the next.

| Row | PR  | Branch                                       | Outcome                                                                                |
| --- | --- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | #76 | `chore/ci-dry-release-and-size-comment`      | release.yml DRY'd via `npm run verify`; size-limit-action posts gzip delta on PR CI.   |
| 2   | #77 | `chore/ci-npm-audit-gate`                    | `npm audit --omit=dev --audit-level=high` job chained into `test.needs`.               |
| 5   | #78 | `docs/codebase-review-fixups`                | README pre-v1 banner, CONTRIBUTING commit-rule cleanup, vite stale extern, CLAUDE.md.  |
| 6   | #79 | `chore/changeset-base-branch`                | `.changeset/config.json` baseBranch flipped `main` → `develop`.                        |
| 7   | #80 | `refactor/createAgent-buildAgentDeps`        | `createAgent` cyclomatic 59 → <15 via `internal/buildAgentDeps.ts`.                    |
| 8   | #81 | `refactor/agent-tick-helper-split`           | `Agent.tick` 21 → <15 via `internal/tickHelpers.ts`.                                   |
| 9   | #82 | `refactor/agent-restore-and-constructor`     | constructor 23 + `runRestore` 23 → <15 via `internal/agentDepsResolver.ts` + per-slice helpers. |
| 13  | #83 | `feat/demo-loss-curve`                       | SVG sparkline of `history.loss` under Train button.                                    |
| 14  | #84 | `feat/demo-train-epoch-progress`             | `TfjsReasoner.train` `onEpochEnd` callback (minor bump); demo HUD goes live mid-fit.   |
| 15  | #85 | `feat/llm-port-example-and-readme`           | README LLM section, `examples/llm-mock/` deterministic playback example, vision spec status update. |
| 16  | TBD | `feat/tfjs-learner-in-demo`                  | `Agent.setLearner` + Stage-8 score on every SkillFailed branch (minor bump); demo Learning mode wires `TfjsLearner` with `Buffered: N/50` HUD. |
| 17  | #94 | `feat/tfjs-multi-output-softmax`             | 7-way softmax over active-care skills; bundled baseline rebuilt; `TfjsReasoner` JSDoc example (minor bump). |
| 23–25 | #93 | `docs/worktrees-and-jsdoc`                 | CLAUDE.md `.worktrees/` rule + JSDoc on `result.ts` / `IntentionCandidate.ts` / `SkillRegistry.ts`. |
| 18  | TBD | `feat/demo-richer-feature-vector`            | 13-dim feature vector (5 needs + 4 mood one-hot + 1 modifier-count + 3 recent-event counts); bundled baseline rebuilt at `[13, 16, 7]`; demo-only. |

---

## Verify gate (baseline)

As of develop @ 8dc4823:

- `format:check` — clean
- `lint` — 0 errors; residual warnings are the Track 3 ratchet menu
- `typecheck` — clean (strict + `exactOptionalPropertyTypes` +
  `noUncheckedIndexedAccess`)
- `test` — all green
- `build` — clean; every entry point under its `size-limit` budget
  (main 50 KB gzip, integrations 2 KB, tfjs 7 KB)
- `docs` — typedoc generates `docs/api/` from all five public entry
  points, 0 errors

> Counts (`N tests`, `M files`, `X KB gzip`) drift every PR. Source of
> truth is the CI logs and `package.json#size-limit` config — don't
> bake them into prose.

---

## Out of scope (deferred — do not pull in)

- **1.0.0 npm publish.** Held per `project_v1_release_hold.md`.
- **Concrete LLM provider adapters** (`AnthropicLlmProvider`,
  `OpenAiLlmProvider`). Phase B; this roadmap only adds docs + a
  `MockLlmProvider` example.
- **Streaming + tool-use on `LlmProviderPort`.** Phase B; additive
  in 1.x per the port's JSDoc contract.
- **R-08 per-subsystem snapshot versioning.** Required before
  deterministic training-trajectory snapshots.
- **Kernel modularization (1.1).** Composable `AgentModule`, factory
  presets, three-agent showcase — post-1.0.
- **sim-ecs / three.js / Pixi integrations.** Phase B.

---

## Sequencing at a glance

Five tracks. CI hardening lands first (cheap, tightens loop). Docs
cleanup next (drift compounds). Ratchet third (no surprises post-
ratchet because A1 caps are already there). Demo + library seams
land in parallel batches. Tooling closes out.

| #   | Track    | Branch                                              | Scope                                                                            | Cost  | Bump  |
| --- | -------- | --------------------------------------------------- | -------------------------------------------------------------------------------- | ----- | ----- |
| 1   | hardening | `chore/ci-dry-release-and-size-comment`             | DRY release.yml + size-limit-action PR comment                                   | XS    | —     |
| 2   | hardening | `chore/ci-npm-audit-gate`                           | `npm audit --omit=dev --audit-level=high` blocking step                          | XS    | —     |
| 3   | hardening | `chore/ci-actions-sha-pinning`                      | SHA-pin `actions/checkout` etc.                                                  | S     | —     |
| 4   | hardening | `chore/ci-backend-and-os-matrix`                    | tfjs CPU + WASM job; macos-latest + windows-latest checks                        | M     | —     |
| 5   | docs     | `docs/codebase-review-fixups`                       | README pre-release banner, CONTRIBUTING `R<xx>` claim, vite stale extern         | S     | —     |
| 6   | docs     | `chore/changeset-base-branch`                       | `.changeset/config.json` baseBranch `main` → `develop`                           | XS    | —     |
| 7   | ratchet  | `refactor/createAgent-buildAgentDeps`               | Cyclomatic 59 → ≤15 via per-subsystem resolvers                                  | M     | —     |
| 8   | ratchet  | `refactor/agent-tick-helper-split`                  | `Agent.tick` complexity 21 → ≤15; lift more into Tickers                         | M     | —     |
| 9   | ratchet  | `refactor/agent-restore-and-constructor`            | `Agent.restore` 25 + constructor 23 → ≤15                                        | M     | —     |
| 10  | ratchet  | `refactor/mock-llm-completeSync-split`              | `MockLlmProvider.completeSync` 25 → split queue / match-or-error                 | S     | —     |
| 11  | ratchet  | `refactor/persona-bias-extract-helper`              | `personaBias` arrow complexity 16 → named helper                                 | XS    | —     |
| 12  | ratchet  | `refactor/non-null-assertion-cleanups`              | Four `!` sites → `for…of` or `assertDefined` helper                              | S     | —     |
| 13  | demo     | `feat/demo-loss-curve`                              | SVG sparkline of `history.loss` under the Train button                           | S     | —     |
| 14  | demo+lib | `feat/demo-train-epoch-progress`                    | `TfjsReasoner.train` exposes `onEpochEnd`; demo renders `Training… 42/100`       | XS+XS | minor |
| 15  | lib      | `feat/llm-port-example-and-readme`                  | README LLM section + `examples/llm-mock/` minimal MockLlmProvider playback       | S     | —     |
| 16  | demo+lib | `feat/tfjs-learner-in-demo`                         | Wire `TfjsLearner` to demo's Learning mode; observed skills feed training        | M     | —     |
| 17  | lib      | `feat/tfjs-multi-output-softmax`                    | N-way softmax over skills; `interpret` picks `argmax`; demo retrains             | S+M   | minor |
| 18  | demo     | `feat/demo-richer-feature-vector`                   | Add mood + modifier-count + recent-events to the feature vector                  | S     | —     |
| 19  | demo     | `feat/demo-prediction-strip`                        | HUD strip showing last scalar output + `URGENCY_THRESHOLD` line                  | S     | —     |
| 20  | lib      | `feat/tfjs-detect-backend-and-picker`               | `TfjsReasoner.detectBestBackend()` + demo backend dropdown                       | S+S   | minor |
| 21  | tooling  | `chore/vitest-coverage-thresholds`                  | Set coverage floors (lines/functions/branches/statements) at current −2%        | XS    | —     |
| 22  | tooling  | `chore/peer-deps-pin-minimums`                      | `excalibur`, `openai`, `anthropic-sdk`, `sim-ecs` `*` → real semver ranges       | S     | —     |
| 23  | docs     | `docs/result-jsdoc`                                 | JSDoc on `isOk` / `isErr` / `map` / `mapErr` / `andThen` / `unwrap`              | XS    | —     |
| 24  | docs     | `docs/intention-candidate-discriminant`             | Semantic JSDoc on `IntentionCandidate.discriminant` (range, tie-break)           | XS    | —     |
| 25  | docs     | `docs/skill-registry-throws`                        | `SkillRegistry.invoke()` JSDoc `@throws` clause                                  | XS    | —     |

**Recommended order:** 1 → 2 → 5 → 6 → 7 → 8 → 9 → 13 → 14 → 15 →
16 → 17 → 18 → 19 → 20 → 3 → 4 → 10 → 11 → 12 → 21 → 22 →
23/24/25 (batched).

CI hardening rows 1 + 2 first — tightens every subsequent PR. Docs
rows 5 + 6 next (low cost, removes drift). Ratchet rows 7–9 before
the demo work so big files don't slip past 1000 LOC during demo
churn. Demo rows 13–19 in the natural sequence (sparkline → epoch
progress → learner → softmax → richer features → prediction strip).
Backend matrix (4) waits for the backend picker (20) so the matrix
defends a real consumer surface.

---

## Track 1 — Hardening (rows 1–4)

### 1 — DRY release.yml + size-limit PR comment

**Branch:** `chore/ci-dry-release-and-size-comment`

- Replace inlined format / lint / typecheck / test / build steps in
  `.github/workflows/release.yml` with a single `npm run verify`
  call. Future verify changes auto-propagate.
- Add `andresz1/size-limit-action` step to PR-CI. Posts a sticky PR
  comment with before/after gzip delta for each of the 5 budgets in
  `package.json#size-limit`.

**Files:** `.github/workflows/release.yml` (modify),
`.github/workflows/ci.yml` (modify).

**No changeset** — CI-only.

**DoD:** A subsequent PR posts the size comment. Release workflow run
is green on a `0.0.0`-styled tag dry-run.

### 2 — `npm audit` gate

**Branch:** `chore/ci-npm-audit-gate`

Add `npm audit --omit=dev --audit-level=high` to PR CI. Blocking.
Closes the brain.js-style supply-chain hole that slipped in last
time.

**Files:** `.github/workflows/ci.yml`.

**DoD:** A test PR adding a known-vulnerable dep fails the gate.
Current `develop` (post-tfjs swap) passes.

### 3 — Actions SHA pinning

**Branch:** `chore/ci-actions-sha-pinning`

Replace mutable tags (`actions/checkout@v6`, etc.) with full 40-char
commit SHAs. Add a one-line bumper script under `scripts/` so future
updates don't bit-rot.

**When:** Low priority until 1.0 is on the horizon — supply-chain
rigor for a published library, not a development necessity.

### 4 — Backend + OS matrix

**Branch:** `chore/ci-backend-and-os-matrix`

**Depends on:** row 20 (backend picker) so the matrix defends a real
consumer surface.

- tfjs job runs under `cpu` AND `wasm` backends (drop `webgl` —
  needs significant headless-runner work).
- Test matrix expands to `macos-latest` + `windows-latest`. tfjs is
  pure-JS so the matrix is now cheap.

**Cost:** ~1 extra runner-minute per push. Catches platform
surprises early.

---

## Track 2 — Stale documentation (rows 5–6, 23–25)

### 5 — `docs/codebase-review-fixups`

Single PR consolidating the small doc fixes. Each item is independent
but tiny enough to bundle.

- `README.md:7` — strike `(0.1.0)` claim; package.json is `0.0.0`.
  Add "pre-v1, not yet on npm — use `file:` or `link:` for local
  eval" banner above Quickstart.
- `CONTRIBUTING.md:111` — remove the `R<xx>` commit prefix claim
  (no recent commit uses it; convention is `fix(scope):` /
  `feat(scope):`).
- `vite.config.ts:75` — remove stale `gray-matter` from
  `externalPackages`. Not a dep, not imported.
- `.changeset/` audit — the pile is intentional per the v1.0 hold.
  Inline a one-line note in `CLAUDE.md#Changesets` so the hold
  doesn't surprise readers.

**Cost:** S. **No changeset** — docs/config only.

### 6 — Changeset base branch

**Branch:** `chore/changeset-base-branch`

`.changeset/config.json:8` has `baseBranch: "main"` but PRs target
`develop` (per CLAUDE.md §Non-negotiables). The bot's "changed since
base" undercount on develop-targeted PRs. Flip to `"develop"` (or add
a rationale comment if `main` was deliberate for release-only
counting).

**Cost:** XS.

### 23 / 24 / 25 — JSDoc gaps (bundle as one PR) — **shipped**

**Branch:** `docs/worktrees-and-jsdoc` (renamed from
`docs/result-and-cognition-jsdoc` to bundle the new CLAUDE.md
worktree non-negotiable in the same diff).

**As shipped:**

- `src/agent/result.ts` — one-sentence JSDoc added on `isOk`, `isErr`,
  `map`, `mapErr`, `andThen`, `unwrap` per STYLE_GUIDE.md's "JSDoc on
  every exported symbol" rule. Pre-existing module-level JSDoc on the
  `Result<T, E>` type and on `ok` / `err` was left untouched.
- `src/cognition/IntentionCandidate.ts` — `score` field's JSDoc now
  documents the `[0, 1]` range, urgency-alignment, and the tie-break
  intent (equal scores → policy source order wins, since the
  `JsSonReasoner` scan uses strict `>` so the first contributor keeps
  the slot). The original review note's `discriminant` name referred
  conceptually to `score`; no field was renamed or added.
- `src/skills/SkillRegistry.ts` — `invoke()` JSDoc gained an explicit
  `@throws {SkillInvocationError}` clause documenting that an
  unregistered `id` is a wiring bug surfaced as a typed `AgentError`,
  not a domain `err(...)`.

No library behavior change. No changeset.

**Cost:** XS combined.

---

## Track 3 — Ratchet (rows 7–12)

The 11 lint warnings are the menu. Each item its own PR — touching
production-path files in isolation makes review tractable.

### 7 — `createAgent` complexity 59 → ≤15

**Branch:** `refactor/createAgent-buildAgentDeps`

Huge outlier. Extract per-subsystem resolvers (already partly done
via `resolveLifecycle`, `resolveNeeds`, `resolveMoodModel`, etc.)
into a `buildAgentDeps()` composition that reduces the top-level
factory to a flat assembly.

### 8 — `Agent.tick` complexity 21 → ≤15

**Branch:** `refactor/agent-tick-helper-split`

The Ticker / Reconciler split under `internal/` is the right
scaffold; push more of the branching down into those helpers. Aim
for `tick()` to orchestrate, not decide.

### 9 — `Agent.restore` 25 + constructor 23 → ≤15

**Branch:** `refactor/agent-restore-and-constructor`

`restore()` is largely orchestration after row 9 of the prior
roadmap (`RestoreCoordinator`). Push remaining branching into the
coordinator. Constructor split: extract dep-resolution helpers
similar to row 7's pattern.

### 10 — `MockLlmProvider.completeSync` 25 → split

**Branch:** `refactor/mock-llm-completeSync-split`

Split queue-mode vs match-or-error strategies into two functions; the
single 80-line body mixes both.

### 11 — `personaBias` arrow complexity 16

**Branch:** `refactor/persona-bias-extract-helper`

Extract inner weight calculation as a named helper so the main arrow
becomes a `map` over scored candidates.

### 12 — Non-null assertions cleanup

**Branch:** `refactor/non-null-assertion-cleanups`

Four sites: `TfjsReasoner.ts:34` (shuffle), `TfjsSnapshot.ts:45`
(byte copy), `MockLlmProvider.ts:166,173` (post-length-check). All
idiomatic under `noUncheckedIndexedAccess`. Either rewrite as
`for…of` (eliminates the index-access narrowing) or wrap in an
`assertDefined` helper for documentation value. Not urgent — kept on
the menu so the lint warning count keeps shrinking.

---

## Track 4 — Demo polish + library seams (rows 13–20)

### 13 — Loss curve sparkline

**Branch:** `feat/demo-loss-curve`

Render `TfjsReasoner.train()` `history.loss` as an SVG sparkline
directly under the Train button. Player sees the number drop —
learning becomes visible evidence. Pairs with the "Trained ✓ — loss
X → Y" toast already shipped in PR #69.

**Files:**

- `examples/nurture-pet/src/cognitionSwitcher.ts` — pass
  `history.loss` to a new helper.
- `examples/nurture-pet/src/lossSparkline.ts` (new) — pure-DOM SVG
  renderer. No charting lib.
- `examples/nurture-pet/index.html` — anchor `<svg
id="loss-sparkline">`.
- `tests/examples/lossSparkline.test.ts` (new, jsdom).

**No library change. No changeset.** Sequence: do before row 14
(builds on the same plumbing).

### 14 — Per-epoch progress callback

**Branch:** `feat/demo-train-epoch-progress`

**Library scope:** add `onEpochEnd?: (epoch: number, loss: number)
=> void` to `TrainOptions` in
`src/cognition/adapters/tfjs/TfjsReasoner.ts`. Pass through to
`model.fit({ callbacks: { onEpochEnd } })`. JSDoc determinism note:
callback runs synchronously per epoch on the same backend; no
scheduling added.

**Demo scope:** `cognitionSwitcher.ts` consumes the callback to
update the train button text (`Training… 42/100`) and (if row 13
landed) push points into the sparkline mid-fit.

**Bump:** minor (additive `TrainOptions` field).

### 15 — LLM provider example + README

**Branch:** `feat/llm-port-example-and-readme`

The `LlmProviderPort` + `MockLlmProvider` shipped in PR #66 have no
consumer-visible documentation beyond JSDoc. Add:

- README.md "LLM provider port (preview)" section — explains the
  port's role, links to the deferred concrete adapters, shows the
  `MockLlmProvider` shape with a 5-line snippet.
- `examples/llm-mock/index.ts` (new) — minimal Vite-free Node script
  that constructs a `MockLlmProvider` with a 3-script queue, writes
  a tiny `LlmReasoner` adapter that calls `provider.complete(...)`
  once per tick, parses text into an `Intention`, runs through 5
  ticks under `SeededRng` + `ManualClock`, asserts byte-identical
  traces across two runs.
- `examples/llm-mock/package.json` (new — minimal).
- `examples/llm-mock/README.md` (new — 1-page how-to).
- `docs/specs/vision.md` — one-line clarification: port shipped,
  concrete adapters Phase B.

**No library change. No changeset.** Pure docs + example.

**Why now:** Owner asked to "be prepared" for LLM integration. This
exercises the surface end-to-end so any rough edges surface BEFORE
the Phase B adapter work.

### 16 — `TfjsLearner` wired into demo Learning mode — **shipped**

**Branch:** `feat/tfjs-learner-in-demo`

**As shipped:**

- Library: added `Agent.setLearner(learner)` + `Agent.getLearner()` (mirror
  of `setReasoner` / `getReasoner`); Stage 8 (`learner.score`) now also
  fires from every `SkillFailed` branch with `details.failed: true` plus
  the failure code / message. Learner JSDoc updated to document the new
  cadence. Minor bump (additive public surface).
- Demo: `cognition/learning.ts` exposes `buildLearningLearner(agent,
  reasoner)` which constructs a `TfjsLearner` with a 5-dim need-level
  feature projection and a `[1] / [0]` label drawn from
  `details.effectiveness` (success) or `details.failed` (failure).
- Switcher: on entering Learning mode, builds the `TfjsLearner` and
  attaches via `agent.setLearner`. On leaving, attaches a fresh
  `NoopLearner` and disposes the previous one. Untrain disposes too —
  "reset to baseline" drops pending evidence rather than baking it
  in via `flush()`.
- HUD: a `Buffered: N/50` readout next to the Train button, with a
  `— training…` suffix while a background batch is in flight. Polled at
  200 ms while in Learning mode.

**Open question 1 (reward source) resolved:** consumer-supplied
projection via `toTrainingPair`. Demo's `projectLearningOutcome`
inspects `outcome.details` rather than relying on a builtin reward
field, leaving the `LearningOutcome.reward` slot free for richer
consumer policies.

Stage 8 (score) of the tick pipeline is currently a no-op in the
demo (`NoopLearner`). Wire a `TfjsLearner` instance to the
Learning-mode reasoner so observed `SkillCompleted` / `SkillFailed`
outcomes accumulate in a buffer, batch-train every 50 outcomes, and
the model drifts from the bundled baseline as the user plays.

**Steps:**

1. In `examples/nurture-pet/src/cognition/learning.ts`, after
   `TfjsReasoner.fromJSON(...)`, build a sibling `TfjsLearner` with
   the same reasoner reference.
2. Define `toTrainingPair(outcome)` projection — `SkillCompleted`
   becomes a positive-reward pair (features = current need levels at
   tick, label = `[1]`); `SkillFailed` becomes negative (`[0]`).
3. Pass the learner to `createAgent({ learner })`.
4. Add a HUD readout: `Buffered: 12 / 50 — training…` so the
   reinforcement loop is observable.
5. New unit test: scripted run of N outcomes triggers exactly
   `floor(N/50)` background `train()` calls + final `flush()` on
   reset.

**Cost:** M. Small library docstring update on `Learner.score()`'s
expected call cadence; no library code change.

### 17 — Multi-output softmax action selection — **shipped**

**Branch:** `feat/tfjs-multi-output-softmax`

**As shipped:**

- Library: added a fenced TypeScript JSDoc example to `TfjsReasoner`
  demonstrating the N-way softmax pattern (build → compile with
  `categoricalCrossentropy` → `interpret` picks `argmax` with an
  idle floor → map to one of K intention ids). No source change — the
  adapter already returned `dataSync()`-flattened arrays — so the
  bundle stays at the same byte budget. Minor bump (consumer-facing
  doc surface).
- Demo: re-authored `examples/nurture-pet/src/cognition/learning.network.json`
  at the new `[5, 16, 7]` topology — 5 need-level inputs → 16 sigmoid
  hidden → 7-way softmax over the active-care skills. The bundled
  baseline is generated via the new `scripts/seed-learning-network.ts`
  one-shot (deterministic; LCG-seeded; trained 50 epochs on a
  hand-crafted archetype distribution that maps lowest-need to its
  matching skill plus dedicated `pet` / `scold` archetypes). The script
  is wired as `npm run seed:learning-network` but NOT into `verify` —
  it runs on demand to refresh the bundled baseline.
- Demo: `learning.ts` `interpret` retired the scalar-urgency gate plus
  the `topCandidate` fallback. The new `interpretSoftmax(output)`
  picks `argmax`, returns `null` (idle) when the max probability sits
  below `IDLE_THRESHOLD = 0.2`, and returns
  `{ kind: 'satisfy', type: <skillId> }` otherwise. Loss switched from
  `meanSquaredError` to `categoricalCrossentropy`.
- Demo: `projectLearningOutcome` produces one-hot 7-vector labels
  keyed by `outcome.intention.type` against `SOFTMAX_SKILL_IDS`.
  Outcomes whose intention falls outside the softmax index (e.g.
  expression skills) are skipped — they don't pollute the active-care
  baseline.
- Demo: `cognitionSwitcher.ts` Train button's synthetic 30-pair set
  now uses `featuresToOneHotLabel(features)` (lowest-need → matching
  maintenance skill, plus `pet` / `scold` archetypes for high-need /
  over-stimulated states) so a click reinforces the same heuristic
  the bundled baseline approximates.
- Tests: `tests/examples/learningMode.train.test.ts` now asserts the
  trained snapshot's `weightsShapes` matches the `[5, 16] / [16] /
  [16, 7] / [7]` contract; outcomes labeled as one-hot 7-vectors;
  out-of-softmax intentions skipped. New `interpretSoftmax` describe
  covers argmax + idle floor + tie-break + per-skill emission.

**Open question 2 (softmax target shape) resolved:** stick to the 7
active-care skills (`feed / clean / play / rest / pet / medicate /
scold`). Expression skills (`meow / sad / sleepy`) stay in the
heuristic-reactive layer (`NeedsPolicy`) because they're emoted
reflexively from need state rather than deliberately chosen — a
learning-mode argmax over them would conflict with the always-on
heuristic emission. The softmax stays consequentialist; the heuristic
layer stays reactive.

### 18 — Richer feature vector — **shipped**

**Branch:** `feat/demo-richer-feature-vector`

**As shipped:**

- `examples/nurture-pet/src/cognition/learning.ts` grew the feature
  vector from 5 need levels to 13 dims:
  - 5 need levels (hunger / cleanliness / happiness / energy / health)
  - 4 mood one-hot dims indexed by `MOOD_KEYS = ['happy', 'sad',
    'sleepy', 'playful']` (off-roster moods → all-zero on this section)
  - 1 active-modifier count, normalized via
    `min(count, COUNT_NORM_CAP=5) / COUNT_NORM_CAP`
  - 3 recent-event counts (`SkillCompleted` / `SkillFailed` /
    `NeedCritical`) in the last 30 `AgentTicked` ticks, each normalized
    via the same cap
- `setLearningAgentId(id)` was renamed to `setLearningAgent(agent)` —
  pre-1.0 clean break, no compat shim. The new function subscribes to
  the standard event bus to populate module-scoped mood + recent-event
  state without widening the adapter's `helpers` shape.
- `projectLearningOutcome` now produces 13-dim features at outcome
  time (mood + modifier-count + event-counts come from
  `agent.getState()` + the same module-scoped event window).
- `cognitionSwitcher.ts`'s synthetic Train-button generator appends 8
  uniform-`[0, 1]` noise dims to each archetype sample so labels stay
  conditioned on the 5 need dims; the network learns to ignore the
  trailing dims under the synthetic regime, leaving the in-game
  `TfjsLearner` reinforcement loop to teach predictive weight on those
  dims from real outcomes.
- `scripts/seed-learning-network.ts` now builds a `[13, 16, 7]`
  Sequential and pads training pairs with the same uniform-noise tail.
  The bundled `examples/nurture-pet/src/cognition/learning.network.json`
  was regenerated at the new shape.
- Hydration guard in `learning.ts` already validated input + output
  dims (PR #94 P2); the upgrade to `FEATURE_DIM = 13` lets old
  5-input snapshots fail fast and fall back to the new baseline.

**Library impact:** small additive — `CognitionPipeline.invokeSkillAction`
now snapshots `agent.modifiers.list().length` alongside `preNeeds`
and includes it on every `LearningOutcome.details` payload as
`preModifierCount`. Pulled in after Codex's PR #96 P1 review surfaced
the same direction-inversion concern that drove the existing
`preNeeds` snapshot — without a kernel-supplied snapshot the demo
projection couldn't recover pre-skill modifier count for player-click
paths.

**Cost:** S. **Minor changeset** — `preModifierCount` is additive on
the `LearningOutcome.details` shape.

### 19 — Live prediction strip

**Branch:** `feat/demo-prediction-strip`

Render the network's last scalar (or, post-row 17, the softmax
distribution) as a horizontal bar under the HUD, with a vertical
line at `URGENCY_THRESHOLD`. Player sees *why* the pet idled vs.
acted this tick — turns the black-box policy into an explainable one.

**Files:**

- `examples/nurture-pet/src/predictionStrip.ts` (new)
- `cognitionSwitcher.ts` — fan the per-tick prediction out via a
  small observable; the strip subscribes
- `index.html` — anchor

**Library impact:** none, but consider exposing a
`reasoner.lastPrediction` getter on `TfjsReasoner` if the closure
plumbing gets ugly. Defer until the demo work proves it's needed.

### 20 — Backend probe + picker

**Branch:** `feat/tfjs-detect-backend-and-picker`

**Library scope:**

- New static `TfjsReasoner.detectBestBackend(): Promise<'webgl' |
  'wasm' | 'cpu'>` — probes in that order, returns the first that
  registers without throwing. Side-effect-imports the corresponding
  `@tensorflow/tfjs-backend-*` package (lazy dynamic `import()`).
- JSDoc invariant: GPU backends (`webgl`) are NOT determinism-
  preserving. Document that bit-identical replay is CPU-only.

**Demo scope:**

- Dropdown next to the cognition mode picker: `CPU` (default) /
  `WebGL` / `WASM`. Selecting one calls `tf.setBackend(...)` then
  re-constructs the active reasoner via the existing
  `mode.construct()` path.
- Persist selection in localStorage like the speed picker.
- Disable picker options whose backend probe fails.

**Bump:** minor (new public static on `TfjsReasoner`).

**Sequence:** before row 4 (backend matrix in CI).

---

## Track 5 — Tooling (rows 21–22)

### 21 — Vitest coverage thresholds

**Branch:** `chore/vitest-coverage-thresholds`

`vite.config.ts:156-161` sets up the reporter but doesn't enforce
`thresholds: { lines, functions, branches, statements }`. CI runs
coverage (`test:coverage`) but a drop wouldn't fail. Measure current
baseline, set at -2% floor.

**Cost:** XS.

### 22 — Peer deps pin minimums

**Branch:** `chore/peer-deps-pin-minimums`

`package.json:117,123,124,120` — `@anthropic-ai/sdk`, `openai`,
`sim-ecs`, `excalibur` all declare `"*"`. Allowing any major version
is risky for consumers. Pin minimums (e.g. `^0.32.0` for excalibur,
`^0.27.0` for Anthropic SDK, etc. — match the actually-tested
versions).

**Cost:** S.

---

## Open questions

1. **Row 16 reward source.** `TfjsLearner`'s reward — deterministic
   from `SkillCompleted` event's effectiveness field, OR
   consumer-supplied via a `rewardOf(outcome)` projection passed to
   `toTrainingPair`? Defaulting to consumer-supplied keeps the lib
   consumer-driven, which matches the rest of the cognition surface.
   Confirm during the per-PR plan for row 16.

2. **Row 17 softmax target shape.** The 7 default skills are `feed
/ clean / play / rest / pet / medicate / scold`. The expression
   skills (`meow / sad / sleepy`) live in a separate module. Decide
   during row 17's per-PR plan: include them in the softmax (10-way)
   or keep them as the heuristic reactive layer.

3. **Row 20 backend picker UX.** Show the 3-way picker always (with
   disabled options) like the cognition picker, or hide unavailable
   backends? The cognition picker pattern is "show + disable +
   tooltip" — likely correct here too for educational value. Confirm
   during row 20.

4. **Row 15 LLM example placement.** `examples/llm-mock/` as a
   sibling to `examples/nurture-pet/`, OR as a `tests/examples/`
   integration asserting deterministic replay? README points to it,
   so a sibling is more discoverable. Confirm during row 15.

---

## Workflow — independent PRs, batch open, multi-pass Codex resolution

1. **Independent branches.** Each row's branch is cut fresh from
   `develop`. Never stack. If two rows touch the same file (rare),
   still cut them separately and rebase the second after the first
   merges.
2. **Batch execution, batch open.** A session can ship multiple PRs
   in one go — implement each in turn, push, open PR. Do NOT wait
   serially for Codex on each before starting the next. Open all the
   independent PRs the session covers, THEN switch into review mode.
3. **Multi-pass Codex resolution.** Once PRs are open, sweep them PR
   by PR:
   - `gh pr view <num> --comments` +
     `gh api repos/<org>/<repo>/pulls/<num>/comments` to read line
     comments.
   - Address real findings with a follow-up commit on the same
     branch. Push (don't rebase mid-review — line anchors break).
   - Repeat until Codex posts a 👍 reaction. Codex docs: "If Codex
     has suggestions, it will comment; otherwise it will react with
     👍."
   - **Skip literal re-flags** of comments you've already addressed.
     Note false-positives in the PR description so reviewers see the
     rationale.
4. **Resolve threads.** Once Codex 👍s, mark each conversation as
   resolved. The bot keeps re-pinging open threads otherwise. Use the
   GitHub UI or `gh api graphql`.
5. **Owner merges.** Don't merge your own PRs. After merge: `git
switch develop && git pull --ff-only origin develop && git fetch
--prune origin && git branch -d <topic>`.
6. **Plan + docs ride with the PR.** When a PR completes a row in
   this plan, mark it shipped (or move it under "What's already
   shipped") IN THE SAME PR. When the PR changes user-visible surface
   (`README.md`, `STYLE_GUIDE.md`, `PUBLISHING.md`, the matching
   spec), update those docs in the same diff. No "docs catch-up"
   follow-up PRs — stale plans force a second review cycle and
   degrade Codex review quality. Captured in `MEMORY.md →
   feedback_docs_alongside_pr.md`.

The full loop is captured in `MEMORY.md → feedback_pr_workflow.md`.

**Pre-1.0 reminder.** No shipped consumers exist. Don't ship
migration / compat layers for prior pre-release shapes. Clean breaks
are the right call. See `MEMORY.md →
feedback_prerelease_no_migration.md` — PR #72 burned 11 fixups
defending against a v1 layout that didn't exist.

---

## How to pick this up next session

1. Read this file + `MEMORY.md` (auto-loaded).
2. Pick the next row by sequencing recommendation. Cut a fresh
   branch from `develop`.
3. Implement; `npm run verify` green; push; open PR with
   Summary / Test plan / Notes for review sections per
   `feedback_pr_workflow.md`.
4. Open all the independent PRs the session covers, then sweep
   Codex.
5. Owner merges.
