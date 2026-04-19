---
name: verify
description: Runs the full agentonomous pre-PR gate — format:check, lint, typecheck, tests, and build — and reports failures concisely. Use before opening or updating a PR to develop, after landing several commits, or whenever the user asks to "verify", "check everything", or "run all checks". Stops at the first failing stage and surfaces the exact command to reproduce it.
---

# verify — run the full pre-PR gate

This skill wraps `npm run verify` with staged reporting so failures are
easy to act on. The underlying npm script runs all five stages
sequentially; if any fails, later stages are skipped.

## Stages

1. `npm run format:check` — Prettier
2. `npm run lint` — ESLint flat config
3. `npm run typecheck` — `tsc --noEmit` (strict + exactOptionalPropertyTypes)
4. `npm test` — Vitest (~300 tests; don't hard-code the count in reports)
5. `npm run build` — Vite library mode → `dist/`

## How to use

Default path — run the composite script:

```bash
npm run verify
```

If that fails, re-run the failing stage in isolation so its output is
easier to read:

```bash
npm run format:check   # if formatting is the issue
npm run lint           # if lint is the issue
npm run typecheck      # if types are the issue
npm test               # if a test is the issue
npm run build          # if the build is the issue
```

## Reporting

After `verify` completes, report:

- **Pass:** one-line confirmation (`All 5 stages green — ready to
PR.`). Include the current test count so regressions in coverage are
  visible at a glance.
- **Fail:** name the failing stage, quote the first error, and suggest
  the single command to reproduce. Don't dump full stack traces unless
  the user asks.

## Auto-fix shortcuts

- Prettier failures → `npm run format` (writes changes in place).
- ESLint auto-fixable → `npm run lint:fix`.
- Typecheck + test failures → needs real code changes; read the error,
  fix the cause, re-run.

## Do not

- Do NOT use `--no-verify` or skip stages to "unstick" the pipeline.
- Do NOT commit the `dist/` output (it's gitignored) — the build step is
  a sanity check, not a deliverable.
- Do NOT reduce the test count to make things pass. Every deleted test
  needs a written justification.
