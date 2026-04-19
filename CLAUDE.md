# CLAUDE.md

Project memory for Claude Code. Keep this file terse — details belong in
`CONTRIBUTING.md`, `STYLE_GUIDE.md`, `PUBLISHING.md`, and the source.

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
  integration branch. All work lives on short-lived topic branches cut from
  `develop` (`feat/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…`).
  **Never push directly to `main` or `develop`.** PRs target `develop`
  (except hotfixes, which target `main`).
- **Pre-PR gate.** `npm run verify` must be green before opening a PR.
  Equivalent to `format:check && lint && typecheck && test && build`.
- **No `--no-verify`.** If a pre-commit hook fails, fix the cause — don't
  bypass it. CI will reject `--no-verify`'d commits anyway.

## Key commands

```bash
npm test              # vitest run (288 tests)
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
- `src/skills/` — `Skill` interface + `SkillRegistry` + 10 defaults under
  `src/skills/defaults/`. Skills return `ok(...)` / `err(...)`.
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
- `examples/nurture-pet/` is a workspace-local Vite demo consuming the
  built `dist/`. Build the library first (`npm run build`) before running
  the demo.

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

## Changesets

PRs that change library behavior need a changeset (`npm run changeset`).
Docs / refactor / chore PRs can skip it. The `.changeset/*.md` file goes in
the same PR.

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
  see `.claude/plans/pause-semantics.md`.
