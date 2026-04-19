# Style guide

This document pins the stylistic conventions for `src/` and `tests/`.
`CONTRIBUTING.md` covers workflow; this file is just the code-level rules
that prettier and eslint can't always enforce mechanically.

Where prettier or eslint already enforces a rule, we say so and move on.

## TypeScript features

- **Strict mode on.** `strict`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `noImplicitReturns` — all on. Don't turn
  any off without discussion.
- **ESM only.** `"type": "module"` in `package.json`; all relative imports
  carry the `.js` extension (`verbatimModuleSyntax`). No CommonJS, no
  dynamic `require`.
- **`type` vs. `interface`.** Prefer `type X = …` for unions, tuples,
  mapped types, conditional types, primitives, and any shape that looks
  algebraic. Use `interface X` for open object shapes that consumers are
  expected to extend, or when declaration merging is deliberate. When in
  doubt → `type`.
- **`unknown` over `any`.** `any` is an escape hatch of last resort. Every
  `any` in `src/` should either be deleted or carry a one-line comment
  explaining why `unknown` wasn't usable.
- **No enums.** Use `as const` unions of string literals. Enums are a
  runtime payload for a compile-time concept and don't play nicely with
  the library's determinism contract.
- **Immutable by default.** Fields are `readonly` unless mutation is
  genuinely required. Arrays returned from public surfaces are
  `readonly T[]`.
- **Exhaustiveness.** `switch` statements over union discriminants end with
  a `default: { const _exhaust: never = value; throw new Error(...) }`
  block when the union is closed.

## File layout

- **One concept per file.** A file named `FooSkill.ts` exports `FooSkill`
  and at most its immediate helpers. No kitchen-sink modules.
- **Test mirror.** Every `src/foo/Bar.ts` has an optional
  `tests/unit/foo/Bar.test.ts`. Integration tests go under
  `tests/integration/`.
- **Barrel control.** `src/index.ts` re-exports the public surface.
  Internal modules (anything under `src/agent/internal/`, anything
  prefixed `_`) do NOT appear in the barrel.

## Exports

- **Top-level JSDoc on every exported class / interface / type / const.**
  Three requirements:
  1. The first sentence describes the concept in one line.
  2. The body explains the non-obvious invariants — when to use it, what
     breaks, what it's NOT.
  3. Renderable in IntelliSense — no multi-page essays, no ASCII diagrams
     that break Markdown parsers.
- **Barrel JSDoc.** One-liner comments above each re-export when the
  identifier name is opaque on its own (see the cognition + needs + mood
  sections of `src/index.ts`).
- **No default exports.** Named exports only. Default exports break
  re-exporting and make grep harder.

## Imports

- **Alphabetized inside each group.** Prettier doesn't sort them; eslint's
  `perfectionist/sort-imports` or manual discipline does.
- **Grouped:** standard library / node built-ins → third-party packages →
  workspace (`../...`) → local (`./...`). A blank line between groups is
  optional; consistency within a file is what matters.
- **Type-only imports.** Use `import type` when the import is purely a
  type — `verbatimModuleSyntax` requires it.

## JSDoc

- Reserve `//` comments for WHY-is-this-weird explanations that belong
  inline with the code. Everything else that documents a symbol lives in
  JSDoc.
- No `@param` / `@returns` tags when the types are self-documenting. Use
  them only when the prose clarifies units, valid ranges, or error modes.
- No `@deprecated` without a migration path.
- Code fences in JSDoc are fine; keep them short.

## Naming

- **Classes:** `PascalCase`, noun-phrased. `UrgencyReasoner`,
  `AnimationStateMachine`.
- **Interfaces + types:** `PascalCase`, noun-phrased. No `I` prefix.
- **Functions + methods:** `camelCase`, verb-phrased. `createAgent`,
  `satisfyNeed`, `selectIntention`.
- **Constants:** `SCREAMING_SNAKE_CASE` for module-scoped literals
  (`DEFAULT_TIME_SCALE`, `DECEASED_STAGE`). Local constants inside
  functions are `camelCase`.
- **Booleans:** `is` / `has` / `should` / `can` prefix. `isInvokeSkillAction`,
  `hasModifier`, `shouldSave`.
- **Private / internal:** leading underscore on exported-but-internal
  symbols (`_internalPublish`, `_internalDie`). Every other private
  member uses TypeScript's `private` or `protected`.

## Commenting

- Prose comments explain the WHY, not the WHAT — the latter belongs in the
  code itself.
- References to old milestones (`// M2:`, `// Phase B`) rot fast. Use them
  only in the immediate commit they land in, and remove them in the next
  pass (or open an issue if the reference still has value).
- No `TODO` comments without a linked issue number. `// TODO` alone is
  worse than no comment — it's a landmine.

## Testing

- **Arrange / Act / Assert.** Blank lines between the three phases inside
  longer tests.
- **Descriptive titles.** `it('returns null when the only candidate scores
below threshold')` > `it('threshold')`.
- **Seed everything.** Agent-level tests always construct with
  `SeededRng(<literal>)` and `ManualClock(<literal>)` — never
  `new SystemClock()`.
- **Observable assertions.** Prefer asserting on event streams + public
  state slices (`agent.getState()`, `agent.rng.next()`) over reaching for
  protected fields. Reserve field access for the extraction tests of the
  `src/agent/internal/*` helpers.

## Flagged files under R-27

The following files were authored in parallel by sub-agents during Phase A
and should be held to this style going forward:

- `src/skills/defaults/*.ts` (all ten default skills)
- `src/body/*.ts`
- `src/randomEvents/*.ts`
- `src/agent/RemoteController.ts`
- `src/agent/ScriptedController.ts`

When editing any of the above, re-read the relevant section above and
match it. Any `Phase B` references left over from the subagent prompts
have been scrubbed in R-22; keep them out.

## Enforcement

- `npm run lint` covers the eslint-enforceable rules.
- `npm run format:check` covers prettier rules.
- Everything else in this guide is on human review at PR time.
