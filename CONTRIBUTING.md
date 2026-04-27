# Contributing to agentonomous

Thanks for helping out. This document captures the workflow we've converged on
for branches, commits, releases, and local development.

> **Working with an AI coding assistant?** See
> [`.claude/memory/`](./.claude/memory/) — a checked-in, project-wide
> memory bank covering release posture, review workflow, and the
> conventions Codex / maintainer reviews assume. Same baseline for every
> contributor and every agent. Start with
> [`.claude/memory/MEMORY.md`](./.claude/memory/MEMORY.md).

## Branch model

We follow a [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)–flavored
layout with three long-lived branches:

| Branch    | Purpose                                                                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`    | Tracks what's currently published on npm. Tagged `vX.Y.Z` per release.                                                                                                                                                              |
| `develop` | Integration branch. Reflects the latest accepted work toward the next release.                                                                                                                                                      |
| `demo`    | Powers the GitHub Pages demo at `https://<owner>.github.io/agentonomous/`. Promoted from `develop` on demand — decoupled from `main` so demo updates don't require a release. See [PUBLISHING.md](./PUBLISHING.md#demo-deployment). |

Feature branches, bug fixes, and remediation work all live on short-lived
topic branches cut from `develop`:

- `feat/<slug>` — new features (`feat/markdown-memory-adapter`).
- `fix/<slug>` — bug fixes (`fix/snapshot-roundtrip-mood`).
- `refactor/<slug>` — internal reshaping with no behavior change.
- `docs/<slug>` — documentation-only.
- `chore/<slug>` — tooling, config, CI, build — no library behavior.
- `test/<slug>` — test-only additions or restructuring.

### One PR, one branch

Every logically independent change gets its own topic branch cut from
`develop`. Do **not** stack unrelated work on a single branch and split
it into PRs afterwards — that forces cherry-picking, duplicate review
rounds, and redundant `npm run verify` passes. The only time a shared
branch is acceptable is when a later task genuinely depends on an
earlier, still-unmerged task.

If a session covers three independent items, cut three branches up
front and open three PRs in parallel.

### Lifecycle of a change

```
develop ─────────────────────────────────────────────▶
         \                                         /
          \─ feat/foo ─ fix/bar ─ refactor/baz ──/
                                                  ▲
                                                  │
                                                  PR + review
```

1. Refresh `develop`: `git switch develop && git pull origin develop`.
2. Branch: `git switch -c feat/foo`.
3. Commit locally. Follow the commit-message convention below. Keep
   commits small and reversible; no merge commits on the topic branch
   while it's in review.
4. Run `npm run verify` until it's green.
5. Push: `git push -u origin feat/foo`. Open a PR targeting `develop`.
6. CI + reviewer must approve. **Squash-merge** via the GitHub UI so
   `develop` keeps a linear, one-commit-per-PR history.
7. **Cleanup.** Immediately after merge:
   ```bash
   git switch develop
   git pull origin develop
   git branch -d feat/foo            # local
   # Remote: click "Delete branch" in the merged-PR UI, or:
   # git push origin --delete feat/foo
   git fetch --prune origin          # drop stale tracking refs
   ```

### Keeping a long-running topic branch current

If `develop` moves while your PR is in review and you need the new
commits:

```bash
git switch develop && git pull origin develop
git switch feat/foo
git rebase develop                   # linear history, preferred
# or: git merge develop              # only if rebase is impractical
git push --force-with-lease origin feat/foo
```

Rebase over merge — it keeps the PR diff clean and squash-friendly.
Only use `--force-with-lease` (never `--force`) when pushing a rebased
topic branch.

### Releases

Releases flow `develop` → `main`:

1. Cut a `release/vX.Y.Z` branch from `develop` if you need a stabilization
   window, or fast-forward `main` from `develop` directly for a clean tip.
2. Land any last fixups on that branch (changelog regeneration, version bump).
3. Merge into `main`, tag `vX.Y.Z`, push the tag.
4. The `.github/workflows/release.yml` workflow runs `changeset publish` and
   pushes to npm with provenance attestation. See [PUBLISHING.md](./PUBLISHING.md)
   for the full release flow.

Hotfixes that can't wait for `develop`'s next release cycle:

```
main ──────────────▶ main
       \           /
        hotfix/v1.2.1
```

Branch `hotfix/<version>` off `main`, land the fix, tag, ship. Merge back
into `develop` afterwards so the fix propagates.

## Commit messages

Subject line: `<type>: <summary>` or `<type>(<scope>): <summary>`
(Conventional Commits — scope optional).

- `type` is one of `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`, `ci`.
- Keep subjects under 72 chars.
- Body explains **why**, not what. Wrap at 72.
- One logical change per commit. Squash noise before opening a PR.

Examples:

```
fix: snapshot mood roundtrip no longer re-emits MoodChanged

The previous restore path set `currentMood` only when a snapshot
carried one, leaving stale state on partial restores. …
```

```
feat(persistence): add LocalStorage adapter
```

## Pull requests

- Target: always `develop` (except hotfixes → `main`).
- Title: short, imperative, no period. "Add markdown memory adapter".
- Body: summary + test plan. Link to relevant issue or PR numbers (`#NNN`).
- Required gates before merge: `npm run verify` (= format:check + lint +
  lint:demo + typecheck + test + build + docs), GitHub Actions CI green. CI runs on every
  push to and PR against `develop`, `main`, or `demo` (see
  `.github/workflows/ci.yml`).
- Reviews: at least one approving review for anything beyond a
  one-line docs tweak.
- Merge strategy: **squash-merge**. Keeps `develop` linear with one
  commit per PR and keeps the PR's granular history in the PR timeline.

## Local setup

```bash
nvm use               # node 22
npm install
npm test              # vitest
npm run typecheck     # tsc --noEmit
npm run lint          # eslint flat config
npm run format        # prettier --write .
npm run build         # vite library mode
```

### Husky + lint-staged

Pre-commit hooks run `eslint --fix` and `prettier --write` on staged
files. **Do not bypass hooks.** `--no-verify` / `-n` on `git commit` is
prohibited: if a hook fails, fix the underlying cause. CI re-runs the
same checks and will reject any commit that skipped them locally. The
Claude Code harness denies the flag at the permission layer as well.

### Changesets

Every PR that changes library behavior needs a changeset describing the
semver bump + user-facing summary:

```bash
npm run changeset
```

The generated `.changeset/*.md` file goes in the same commit. Docs-only and
refactor-only PRs can skip changesets.

## Testing

- `tests/unit/` mirrors `src/` one-for-one. Test filename: same as the source
  file under test with `.test.ts`.
- `tests/integration/` hosts multi-subsystem tests (e.g. deterministic-replay).
- Under `SeededRng` + `ManualClock`, the same inputs must produce byte-identical
  `DecisionTrace`s. Two runs with matching setup → `expect(runA).toEqual(runB)`.

## Coding conventions

- TypeScript strict mode, `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`
  both on.
- ESM, `.js` extensions in relative imports (`verbatimModuleSyntax`).
- No `Date.now()` / `Math.random()` / `setTimeout` in library code — ports only
  (`WallClock`, `Rng`). ESLint enforces this.
- Default to no comments; reserve JSDoc for non-obvious invariants or
  public API. `//` comments only when the WHY isn't already in the code.
