# Contributing to agentonomous

Thanks for helping out. This document captures the workflow we've converged on
for branches, commits, releases, and local development.

## Branch model

We follow a [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)–flavored
layout with two long-lived branches:

| Branch    | Purpose                                                                        |
| --------- | ------------------------------------------------------------------------------ |
| `main`    | Tracks what's currently published on npm. Tagged `vX.Y.Z` per release.         |
| `develop` | Integration branch. Reflects the latest accepted work toward the next release. |

Feature branches, bug fixes, and remediation work all live on short-lived
topic branches cut from `develop`:

- `feat/<slug>` — new features (`feat/markdown-memory-adapter`).
- `fix/<slug>` — bug fixes (`fix/snapshot-roundtrip-mood`).
- `refactor/<slug>` — internal reshaping with no behavior change.
- `docs/<slug>` — documentation-only.
- `phase-<n>/<theme>` — large multi-item work (`phase-a1/persistence`).

### Lifecycle of a change

```
develop ─────────────────────────────────────────────▶
         \                                         /
          \─ feat/foo ─ fix/bar ─ refactor/baz ──/
                                                  ▲
                                                  │
                                                  PR + review
```

1. Branch from `develop`: `git switch develop && git pull && git switch -c feat/foo`.
2. Commit locally. Follow the commit-message convention below.
3. Push. Open a pull request targeting `develop`.
4. CI gates + reviewer approve. Squash-or-rebase merge. Delete the topic branch.
5. `develop` accumulates merged work until we're ready to release.

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

Subject line: `<type>: <summary>` or `<Rxx>: <summary>` for remediation items.

- `type` is one of `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`, `ci`.
- Keep subjects under 72 chars.
- Body explains **why**, not what. Wrap at 72.
- One logical change per commit. Squash noise before opening a PR.

Example:

```
fix: snapshot mood roundtrip no longer re-emits MoodChanged

The previous restore path set `currentMood` only when a snapshot
carried one, leaving stale state on partial restores. …
```

## Pull requests

- Target: always `develop` (except hotfixes → `main`).
- Title: short, imperative, no period. "Add markdown memory adapter".
- Body: summary + test plan. Link to relevant R-XX or issue numbers.
- Required gates before merge: `npm run verify` (= format:check + lint +
  typecheck + test + build), GitHub Actions CI green.
- Reviews: at least one approving review for anything beyond a
  one-line docs tweak.

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

Pre-commit hooks run `eslint --fix` and `prettier --write` on staged files.
To bypass in emergencies: `git commit --no-verify` (discouraged — it means
CI will reject the PR).

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
