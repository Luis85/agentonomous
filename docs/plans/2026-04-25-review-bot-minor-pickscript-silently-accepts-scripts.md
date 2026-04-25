---
date: 2026-04-25
slug: review-bot-minor-pickscript-silently-accepts-scripts
finding-id: 682b557.2
tracker: '#87'
severity: MINOR
---

# Fix review finding `682b557.2` — pickScript silently accepts scripts with no match predicate in match-or-error mode

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject `MockLlmProvider` construction when `dispatch: 'match-or-error'` is paired with any script that lacks a `match` predicate, so misconfigured mocks surface at construction time instead of at first request.

**Architecture:** Add a single eager-validation block at the top of the existing `MockLlmProvider` constructor (`src/ports/MockLlmProvider.ts`). No new files, no new types — the dispatch mode and scripts list are already constructor inputs, so the check is a guard before the existing assignments. Behavior change is constructor-time: previously a `match-or-error` provider built with a script missing `match` would later throw `no script matched the request.` on every request; now it throws at construction with the offending index.

**Tech Stack:** TypeScript (strict + `exactOptionalPropertyTypes`), vitest, ESM with `.js` import suffixes. Tests mirror `src/` 1:1 under `tests/unit/`.

## Source

From `#87` comment 4319403042, finding `682b557.2`:

> **[MINOR]** `src/ports/MockLlmProvider.ts:155` — pickScript silently accepts scripts with no match predicate in match-or-error mode
>
> **Problem:** `match-or-error` dispatch mode silently accepts scripts with no `match` predicate at construction time, but those scripts can never fire.
>
> **Why it matters:** A test author writing `dispatch: 'match-or-error'` and accidentally omitting `match` on one entry gets a cryptic `MockLlmProvider: no script matched the request.` at runtime rather than an immediate construction-time failure. Debugging a mis-configured mock during a failing integration test is significantly harder than a thrown constructor error.
>
> The predicate check in `pickScript`:
>
> ```ts
> const hits = this.scripts.filter((s) => s.match?.(messages, options) === true);
> ```
>
> `s.match?.()` returns `undefined` when `match` is absent; `undefined === true` is `false`, so the script is invisible to `match-or-error` dispatch.

## Acceptance

- Constructor throws when `dispatch: 'match-or-error'` plus any `scripts[i]` has `match === undefined`.
- Error names the offending index and the dispatch mode.
- `dispatch: 'queue'` (default) and `dispatch: 'match-or-error'` with all-`match`-set scripts continue to behave identically.
- New unit test covers throw + does not regress existing tests.
- `npm run verify` green.

---

## Chunk 1: Implement guard + tests

### Task 1: Add failing test for construction-time guard

**Files:**
- Modify: `tests/unit/ports/MockLlmProvider.test.ts` (append a new `it(...)` inside the existing `describe('MockLlmProvider', ...)` block)

- [ ] **Step 1.1: Add the failing test**

Append the following test inside the existing `describe('MockLlmProvider', () => { ... })` block in `tests/unit/ports/MockLlmProvider.test.ts`, immediately after the `'match-or-error dispatch: rejects when more than one script matches'` test:

```ts
  it('match-or-error dispatch: rejects construction when any script lacks a match predicate', () => {
    expect(
      () =>
        new MockLlmProvider({
          dispatch: 'match-or-error',
          scripts: [
            { text: 'has match', match: () => true },
            { text: 'no match' },
          ],
        }),
    ).toThrow(/script\[1\].*no 'match' predicate.*match-or-error/s);
  });

  it('match-or-error dispatch: accepts construction when every script has a match predicate', () => {
    expect(
      () =>
        new MockLlmProvider({
          dispatch: 'match-or-error',
          scripts: [
            { text: 'a', match: () => false },
            { text: 'b', match: () => true },
          ],
        }),
    ).not.toThrow();
  });

  it('queue dispatch: still allows scripts without a match predicate', () => {
    expect(
      () => new MockLlmProvider({ scripts: [{ text: 'a' }, { text: 'b' }] }),
    ).not.toThrow();
  });
```

- [ ] **Step 1.2: Run the new tests to verify they fail**

Run: `npx vitest run tests/unit/ports/MockLlmProvider.test.ts -t 'rejects construction when any script lacks a match predicate'`

Expected: FAIL — current constructor accepts the bad config, so `expect(...).toThrow(...)` fails with "Expected function to throw, but it did not throw."

The other two new tests should already PASS (positive cases that should keep working under the new code). That is fine — only the rejection test must fail at this step to prove the guard does not yet exist.

### Task 2: Implement constructor guard

**Files:**
- Modify: `src/ports/MockLlmProvider.ts` (constructor body, around lines 67–71)

- [ ] **Step 2.1: Add the eager validation**

In `src/ports/MockLlmProvider.ts`, replace the existing constructor body:

```ts
  constructor(options: MockLlmProviderOptions) {
    this.scripts = options.scripts;
    this.defaultModel = options.defaultModel ?? 'mock-llm';
    this.dispatch = options.dispatch ?? 'queue';
  }
```

with:

```ts
  constructor(options: MockLlmProviderOptions) {
    const dispatch = options.dispatch ?? 'queue';
    if (dispatch === 'match-or-error') {
      const bad = options.scripts.findIndex((s) => s.match === undefined);
      if (bad !== -1) {
        throw new Error(
          `MockLlmProvider: script[${bad}] has no 'match' predicate ` +
            `(required in match-or-error mode — positional fallback is disabled).`,
        );
      }
    }
    this.scripts = options.scripts;
    this.defaultModel = options.defaultModel ?? 'mock-llm';
    this.dispatch = dispatch;
  }
```

Notes for the implementer:
- Compute `dispatch` once at the top so the guard and the field assignment use the same resolved value (avoids re-reading `options.dispatch` twice).
- The error message intentionally calls out both the offending index and the dispatch mode so the failure is self-explanatory in test logs.
- No JSDoc change is needed: the existing `MockLlmProviderOptions.dispatch` JSDoc on lines 37–44 already documents that `match-or-error` has no positional fallback, which is exactly the invariant this guard enforces.

- [ ] **Step 2.2: Run the rejection test to verify it now passes**

Run: `npx vitest run tests/unit/ports/MockLlmProvider.test.ts -t 'rejects construction when any script lacks a match predicate'`

Expected: PASS.

- [ ] **Step 2.3: Run the full `MockLlmProvider` test file to confirm no regressions**

Run: `npx vitest run tests/unit/ports/MockLlmProvider.test.ts`

Expected: all tests in the file (the existing ~17 plus the 3 new ones) PASS.

### Task 3: Update docs that reference the dispatch contract

**Files:**
- Inspect (no edit unless they contradict the new guard): `README.md`, `STYLE_GUIDE.md`, `docs/specs/` entries that mention `MockLlmProvider`.

- [ ] **Step 3.1: Grep for affected docs**

Run: `npx --yes ripgrep@latest 'MockLlmProvider|match-or-error' README.md STYLE_GUIDE.md docs/`
(or `Grep` tool with pattern `MockLlmProvider|match-or-error` over the repo root) and review each hit.

Expected: a small handful of hits. The new constructor guard is **stricter** but does not contradict any existing documented behavior — `match-or-error` was always specified as having no positional fallback. If any doc says the provider "tolerates" scripts without `match` in `match-or-error` mode, fix that line in the same diff. If no doc claims that, no edit is required.

- [ ] **Step 3.2: Skip doc edits if nothing contradicts**

If the grep turns up no contradictions, leave docs untouched and proceed to Task 4. The CLAUDE.md rule "Plan + doc updates ride with the PR that lands the work" applies only when user-visible surface actually changes; this fix tightens an error path on an already-documented invariant.

### Task 4: Add a changeset

**Files:**
- Create: `.changeset/<auto-generated-slug>.md`

- [ ] **Step 4.1: Generate the changeset**

Run: `npm run changeset`

When prompted:
- Bump type: **patch** (bug-fix; constructor now throws earlier on a misconfigured mock — no public API surface added or removed).
- Summary: `Fix MockLlmProvider: throw at construction when 'match-or-error' dispatch is paired with a script missing a 'match' predicate, instead of silently failing at first request.`

If the interactive prompt is unavailable in this environment, hand-create a file at `.changeset/<slug>.md` with the following body:

```markdown
---
'agentonomous': patch
---

`MockLlmProvider`: when `dispatch: 'match-or-error'` is set, the constructor now throws if any script lacks a `match` predicate. Previously, such scripts were silently unreachable and only surfaced as a generic `no script matched the request.` error at first call. The new error names the offending index.
```

- [ ] **Step 4.2: Stage the changeset**

Run: `git add .changeset/`

### Task 5: Verify + commit

- [ ] **Step 5.1: Run the full pre-PR gate**

Run: `npm run verify`

Expected: PASS — `format:check`, `lint`, `typecheck`, `test`, `build` all green.

If `format:check` fails: run `npm run format` and re-run `npm run verify`. If `lint` flags the new code: fix the lint issue rather than `--no-verify`'ing the commit.

- [ ] **Step 5.2: Commit**

```bash
git add src/ports/MockLlmProvider.ts tests/unit/ports/MockLlmProvider.test.ts .changeset/
git commit -m "$(cat <<'EOF'
fix(MockLlmProvider): reject match-or-error scripts missing match predicate at construction

Previously, a script without a `match` predicate in `dispatch:
'match-or-error'` mode was silently unreachable — every request would
fail with the generic `no script matched the request.` error. The
constructor now validates eagerly and throws an error that names the
offending script index and the dispatch mode, making misconfigured
mocks fail loudly at the right place.

Refs #87 finding:682b557.2
EOF
)"
```

If a pre-commit hook fails: fix the underlying issue, re-stage, and create a NEW commit (do NOT `--amend` after a hook rejection — the rejected commit is a no-op, so amending would target the previous landed commit).

### Task 6: Open the PR

- [ ] **Step 6.1: Push the branch**

```bash
git push -u origin fix/review-bot-minor-pickscript-silently-accepts-scripts
```

- [ ] **Step 6.2: Create the PR against `develop`**

```bash
gh pr create --base develop --title "fix(MockLlmProvider): reject match-or-error scripts missing match predicate at construction" --body "$(cat <<'EOF'
## Summary

- `MockLlmProvider` now rejects construction when `dispatch:
  'match-or-error'` is paired with any script missing a `match`
  predicate.
- Error names the offending index and dispatch mode so misconfigured
  mocks surface at construction, not at first request.
- Adds three unit tests: rejection path, accepting all-`match` scripts,
  and confirming queue mode is unaffected.

## Test plan

- [x] `npm run verify` green locally.
- [x] New unit tests cover both the throw and the existing happy paths.

Refs #87 finding:682b557.2
EOF
)"
```

The PR body MUST contain the literal line `Refs #87 finding:682b557.2` (the magic line picked up by the `review-fix-shipped` Action). It MUST NOT contain `Closes #87` / `Fixes #87` — the tracker issue is append-only.

---

## Rollout summary

- Branch: `fix/review-bot-minor-pickscript-silently-accepts-scripts` (already cut by review-fix skill into `.worktrees/fix-review-minor-pickscript-silently-accepts-scripts/`).
- PR base: `develop`.
- PR body magic line: `Refs #87 finding:682b557.2`.
- Changeset: `patch`.
- Post-merge: tracker comment in #87 will be flipped from `- [ ]` to `- [x]` automatically by the `review-fix-shipped` Action — do not edit the tracker by hand.
