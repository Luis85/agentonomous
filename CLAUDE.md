# CLAUDE.md

Project memory for Claude Code. Keep this file terse — details belong in
`CONTRIBUTING.md`, `STYLE_GUIDE.md`, `PUBLISHING.md`, and the source.

> **Shared project memory lives in [`.claude/memory/`](./.claude/memory/).**
> Start with [`.claude/memory/MEMORY.md`](./.claude/memory/MEMORY.md) for
> the index. Those files capture release posture, review workflow, and
> conventions every contributor (human or agent) should know about — they
> supplement, not duplicate, this file.

## What this repo is

`agentonomous` — a TypeScript library for autonomous agents in browser /
Node simulations. Engine-agnostic core, optional Excalibur adapter. Phase A
MVP is a virtual-pet nurture demo (`examples/nurture-pet`).

## Non-negotiables

- **Determinism.** Under a fixed `SeededRng` + `ManualClock`, every tick
  must produce byte-identical `DecisionTrace`s. No raw `Date.now()`,
  `Math.random()`, or `setTimeout` anywhere in `src/` — everything flows
  through `WallClock`, `Rng`, and port interfaces. ESLint enforces this.
- **Branch flow.** `main` tracks published releases. `develop` is the
  integration branch. `demo` is the long-lived branch the GitHub Pages
  demo deploys from (promoted from `develop` on demand — see
  `PUBLISHING.md#demo-deployment`). All work lives on short-lived topic
  branches cut from `develop` (`feat/…`, `fix/…`, `refactor/…`,
  `docs/…`, `chore/…`). **Never push directly to `main`, `develop`, or
  `demo`.** PRs target `develop` (hotfixes target `main`; demo
  promotions target `demo`).
- **One PR, one branch, from the start.** If a session covers multiple
  independent tasks, cut a fresh topic branch from `develop` for each
  one — never stack them on a shared branch and split later. Splitting
  after the fact means cherry-picking, three parallel review rounds, and
  three verify cycles. Only share a branch when a later task genuinely
  depends on an earlier unmerged one (rare).
- **Worktrees per topic branch.** All feature / refactor / chore work
  happens in an isolated `git worktree` under `.worktrees/<branch-slug>`.
  Worktree directory is `.worktrees/` (gitignored). This keeps
  `D:\Projects\agent-library` itself on `develop` so multiple parallel
  agents (one per worktree) can each run `npm install` / `npm test` /
  `npm run dev` without stepping on each other's `node_modules` or vite
  caches. After PR merges: prune the worktree via
  `git worktree remove .worktrees/<branch-slug>` then delete the local
  branch. Never edit `develop` directly outside of post-merge pulls.
- **Post-merge cleanup.** After a PR merges: `git switch develop && git
pull origin develop && git branch -d <topic>`. Delete the remote topic
  branch via the merged-PR UI (or `git push origin --delete <topic>` if
  permissions allow). Prune stale tracking refs with `git fetch --prune
origin` when switching contexts.
- **Pre-PR gate.** `npm run verify` must be green before opening a PR.
  Equivalent to `format:check && lint && typecheck && test && build`.
- **No `--no-verify`.** If a pre-commit hook fails, fix the cause — don't
  bypass it. CI will reject `--no-verify`'d commits anyway.

## Key commands

```bash
npm test              # vitest run
npm run typecheck     # tsc --noEmit (strict + exactOptionalPropertyTypes)
npm run lint          # eslint flat config
npm run format        # prettier --write .
npm run build         # vite lib mode → dist/
npm run verify        # all of the above, sequentially
npm run analyze       # build + top 20 largest dist/*.js by bytes
npm run demo:dev      # build library then run examples/nurture-pet via Vite
```

Node 22 (see `.nvmrc`). Run `nvm use` once per shell.

## Architecture map

- `src/agent/` — the `Agent` class + tick pipeline + control modes. Tick
  helpers live in `src/agent/internal/` (`LifecycleTicker`, `NeedsTicker`,
  `ModifiersTicker`, `MoodReconciler`, `AnimationReconciler`,
  `CognitionPipeline`). Anything under `internal/` is NOT re-exported from
  the barrel.
- `src/cognition/` — `UrgencyReasoner`, `DirectBehaviorRunner`, needs
  policies (`Expressive`, `Active`, `Composed`). Tuning constants in
  `src/cognition/tuning.ts`.
- `src/skills/` — `Skill` interface + `SkillRegistry` + a default
  bundle under `src/skills/defaults/`. Skills return `ok(...)` /
  `err(...)`.
- `src/modifiers/` — stackable buff/debuff system with replace / refresh /
  ignore policies.
- `src/needs/`, `src/mood/`, `src/lifecycle/`, `src/animation/` —
  homeostatic needs, categorical mood, birth→death, animation state
  machine.
- `src/events/` — standard event types on the agent bus.
- `src/persistence/` — versioned `AgentSnapshot` + `LocalStorage` / `Fs` /
  `InMemory` adapters.
- `src/randomEvents/` — seeded per-tick probability table.
- `src/integrations/excalibur/` — optional Excalibur actor sync. Separate
  bundle entry; don't import from core.
- `tests/unit/` mirrors `src/` 1:1. `tests/integration/` is multi-subsystem.
- `examples/nurture-pet/` is a Vite demo that resolves `agentonomous` via
  Vite + tsconfig aliases pointing at `../../dist/` (not an npm dep — a
  `file:../..` link inside its own target triggers `EISDIR` on Windows).
  Build the library first (`npm run build`) before running the demo.

## Style conventions (quick)

Full rules in [`STYLE_GUIDE.md`](./STYLE_GUIDE.md). High-frequency ones:

- ESM, `.js` extensions in relative imports, `import type` for
  type-only imports.
- Prefer `type` over `interface` unless consumers need to extend.
- `unknown` over `any`. No enums — `as const` unions instead.
- JSDoc on every exported symbol. First line = one-sentence concept.
  Body = non-obvious invariants. No `@param`/`@returns` when types
  self-document.
- No default exports. No barrel entry for `internal/` or `_`-prefixed
  files.
- Tests: seed everything (`SeededRng(<literal>)`, `ManualClock(<literal>)`).
  Assert on event streams + `agent.getState()` slices, not protected
  fields.

## Plans & specs location

- **Plans** live in `docs/plans/YYYY-MM-DD-<slug>.md` (implementation
  roadmaps, chunked task lists). Overrides the superpowers `writing-plans`
  default of `docs/superpowers/plans/`.
- **Specs** live in `docs/specs/YYYY-MM-DD-<slug>.md` (design docs,
  brainstorm outputs).
- Date prefix = first-commit date. Never drop the date; rename via
  `git mv` if the slug changes.
- **Plan + doc updates ride with the PR that lands the work.** When a
  PR completes a roadmap row, mark it shipped in the plan (or move it
  under "What's already shipped") in the same diff. When a PR changes
  user-visible surface (new option, new event, new helper), update the
  relevant doc (`README.md`, `STYLE_GUIDE.md`, `PUBLISHING.md`, the
  matching spec) in the same diff. No "docs catch-up" follow-up PRs —
  stale plans force a second review cycle and degrade Codex review
  quality.

## Changesets

PRs that change library behavior need a changeset (`npm run changeset`).
Docs / refactor / chore PRs can skip it. The `.changeset/*.md` file goes in
the same PR.

> The pile of unconsumed changesets on `develop` is intentional — the 1.0
> publish is held by owner decision until library + demo polish lands.
> Don't run `npx changeset version` to consume them; let them accumulate
> until the owner is ready to ship. The next push to `main` is what
> triggers `changesets/action` to open a version PR; until that happens,
> the queued bumps stay queued.

## Common pitfalls

- **Adding a new `Skill`:** register it via an `AgentModule` or the
  registry; expose it through `defaultPetInteractionModule` only if it's
  part of the default bundle. Scaffolding: see
  `.claude/skills/scaffold-agent-skill/SKILL.md`.
- **Snapshot schema changes:** bump `AgentSnapshot.version` and add a
  migration. R-08 (per-subsystem versioning) is deferred — treat the
  current monolithic schema as the contract.
- **Excalibur imports in core:** don't. The integration is peer-optional
  and lives in its own bundle entry.
- **Random events:** `emit()` receives a factory — seed comes from the
  context, never `Math.random()`.
- **`setTimeScale(0)` pause semantics:** Stage 2 / 2.7 / 2.8 (modifier
  expiry, mood, animation reconciliation) are skipped at scale 0 to
  keep the pause observably frozen. `Modifier.expiresAt` is still an
  absolute wall-clock ms — deferred expiry fires on the first
  post-resume tick. Phase B may re-base expiry on virtual time;
  see `docs/plans/2026-04-19-pause-semantics.md`.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:

- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
