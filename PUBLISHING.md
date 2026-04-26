# Publishing

Release flow for `agentonomous`. For contribution workflow + branch model
see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Branch model recap

- `main` — tracks what's on npm. Each release is a tagged commit here.
- `develop` — integration branch; all work lands here first.
- `demo` — long-lived branch powering the public GitHub Pages demo. Promoted
  from `develop` on demand (see [Demo deployment](#demo-deployment)) and
  deliberately decoupled from `main` so docs/demo updates can ship without
  cutting a release.
- Releases flow `develop` → `main`, then a tag triggers the publish workflow.

## Prerequisites

- npm account with publish rights to the `agentonomous` package.
- `NPM_TOKEN` secret configured in GitHub Actions (Settings → Secrets → Actions).
  The token must be an **automation token** (not a classic publish token) so
  npm's provenance attestation works.
- `main` branch protected; releases happen only via Changesets PRs landing on
  `main` (and those PRs originate from `develop` or `release/*`).

## Branch protection checklist

All three long-lived branches (`main`, `develop`, `demo`) should be
protected. Configure in Repo → Settings → Branches → Add rule. Apply the
same baseline to each, with the deltas noted below.

Baseline (all three):

- Require a pull request before merging; require at least 1 approving
  review.
- Require status checks to pass before merging; include every job in the
  `CI` workflow (`Format (Prettier)`, `Lint (ESLint)`,
  `Typecheck (tsc --noEmit)`, `Test (Vitest + coverage)`,
  `Build & size budget`).
- Require branches to be up to date before merging.
- Disallow force pushes. Disallow deletions.
- Do **not** allow bypass for administrators (hold yourself to the same bar).

Per-branch additions:

- **`main`** — do **not** add the `Release candidate` workflow as a
  required status check. Required checks in GitHub branch protection are
  enforced for every incoming PR, but `release-candidate.yml` only runs
  on pushes to `release/v*` branches (or manual dispatch), so marking it
  required would wedge every non-release PR into `main` on a check that
  never reports. Instead, reviewers verify the latest
  `Release candidate` run is green on the source `release/v*` branch
  before approving the release PR. Optional: require signed commits.
- **`develop`** — baseline is sufficient.
- **`demo`** — baseline is sufficient. Remember to add `demo` to the
  `github-pages` environment's deployment branch allow-list (see
  [Demo deployment first-time setup](#demo-deployment)) or the Pages
  deploy job is rejected at the environment gate even when CI is green.

The `.claude/settings.json` denies in this repo mirror these rules at the
Claude Code permission layer; branch protection is the source of truth
and applies to humans + bots alike.

## Local dry runs

Before shipping anything, verify the package looks right:

```bash
# Run the full pre-publish gate (format, lint, typecheck, test, build).
npm run verify

# Check the bundle-size budget (gzip).
npm run size

# Inspect what npm would actually publish.
npm run pack:dry
```

`pack:dry` prints the exact file list + tarball size. Only `dist/`,
`README.md`, and `LICENSE` should appear (per the `files` field in
`package.json`).

`npm run size` runs the `size-limit` budget against the built
`dist/index.js` and `dist/integrations/excalibur/index.js` (gzip). Budgets
live in the `size-limit` field of `package.json`. If a legitimate
feature pushes a bundle over budget, bump the limit in the same PR with
a one-line justification in the commit message.

## Release candidate pre-flight

Any branch matching `release/v*` (e.g. `release/v1.0.0`) is gated by the
`.github/workflows/release-candidate.yml` workflow on every push. It
runs on Node 22 and does everything `CI` does plus:

- **`npm run size`** — the gzip bundle-size budget.
- **Pack + smoke install** — `npm pack` into a tarball, install it into
  a scratch project, and verify the shipped ESM resolves and exports
  `Agent`. Catches "builds fine, broken once users `npm install`" bugs
  that repo-local tests can't see.
- **`npm publish --dry-run`** — validates the would-be publish (files
  list, `publishConfig`, registry auth surface) without actually
  pushing a version to npm.

The workflow can also be kicked off manually from
**Actions → Release candidate → Run workflow** against any `release/v*`
branch.

## Adding a changeset

Every PR that changes library behavior should include a changeset:

```bash
npm run changeset
```

The CLI prompts for:

1. Semver bump: `major` / `minor` / `patch`.
2. A short summary (shows up in `CHANGELOG.md`).

Commit the generated `.changeset/<random>.md` along with the PR. Multiple
changesets per PR are fine — they get merged at release time.

## Automated release

The `.github/workflows/release.yml` workflow runs on every push to `main`:

1. A release PR is prepared on `develop` (or a `release/vX.Y.Z` branch
   cut from `develop`). It bumps `package.json`, regenerates
   `CHANGELOG.md` from the pending `.changeset/` entries, and consumes
   the changeset files. Open the PR with base = `main`.
2. Merging that PR into `main` runs the workflow, which now has no
   pending changesets and instead runs `npm run release` (`changeset publish`
   → `npm publish`) and tags `vX.Y.Z`.
3. npm provenance is attested automatically (`publishConfig.provenance: true`
   - `id-token: write` permission in the workflow + GitHub's OIDC token).
4. After the tag lands, fast-forward `develop` with `main` (or open a
   back-merge PR) so the version bump + changelog propagate back for the
   next cycle.

No manual `npm publish` calls are needed in the normal path.

## First release (v1.0.0)

The initial release is a one-time setup. Everything below happens on
short-lived branches; do **not** push directly to `main` until the
final merge.

Pre-flight (once, before cutting `release/v1.0.0`):

1. **npm token.** Confirm `NPM_TOKEN` is set in Settings → Secrets →
   Actions. Must be an **automation** token (not "Publish" classic)
   for provenance attestation to work.
2. **Branch protection.** Apply the rules in the [checklist
   above](#branch-protection-checklist) to `main`, `develop`, `demo`.
3. **Environment.** Settings → Environments → (create) `npm-publish`
   if you want to add manual approval before npm publishes; otherwise
   the `release` job runs automatically on push to `main`. The
   `github-pages` environment should already include `demo`.
4. **Sanity dry-run.** Locally: `npm run verify && npm run size && npm
pack --dry-run`. All clean.
5. **Changeset.** The v1 changeset should describe the initial public
   API surface. Bump is **major** (pre-1.0 `0.x` → `1.0.0`).
   ```bash
   npm run changeset
   # Pick: major — summary: "Initial public release."
   ```
   Commit the `.changeset/*.md` to `develop` via a regular PR.

Release (on `release/v1.0.0`, cut from `develop`):

1. `git switch develop && git pull origin develop`
2. `git switch -c release/v1.0.0`
3. `npx changeset version` — bumps `package.json` to `1.0.0`,
   rewrites `CHANGELOG.md`, deletes consumed changesets.
4. Commit: `chore(release): v1.0.0`. Push: `git push -u origin
release/v1.0.0`.
5. **`release-candidate.yml` runs.** Wait for the `Preflight` job to go
   green. If the publish dry-run fails, fix and re-push before moving on.
6. Open PR: base `main`, head `release/v1.0.0`. Title:
   `release: v1.0.0`. Wait for CI + release-candidate green, at least
   one approving review.
7. **Squash-merge** via the GitHub UI.
8. `release.yml` fires on the push to `main`, runs `npm run release`
   (`changeset publish`), tags `v1.0.0`, publishes to npm with
   provenance.

Post-flight:

1. Visit https://www.npmjs.com/package/agentonomous — v1.0.0 listed,
   "Signed by GitHub Actions" provenance badge present.
2. In a scratch project: `npm install agentonomous@1.0.0` and check
   `import { Agent } from 'agentonomous'` resolves.
3. Back-merge `main` → `develop` so the version bump + CHANGELOG
   propagate: open a PR base `develop`, head `main`, merge-commit (no
   squash — we want the tag reachable from `develop`).
4. Delete the `release/v1.0.0` branch locally + remote.
5. Announce, celebrate, nap.

## Manual / emergency publish

If CI is broken and you need to ship a patch urgently:

```bash
# 1. Bump the version locally.
npm version patch          # or minor/major

# 2. Run the pre-publish gate (also triggered automatically).
npm run verify

# 3. Publish. Provenance only works from CI — a manual publish will
#    show up on npm without the "Signed by" attestation badge.
npm publish --access public
```

Push the version-bump commit + tag immediately afterward:

```bash
git push && git push --tags
```

## Verifying a release

After a release lands:

- https://www.npmjs.com/package/agentonomous — new version listed, provenance
  badge present.
- `npm install agentonomous@latest` in a scratch project resolves the expected
  version.
- `npx agentonomous --help` is a no-op (this is a library, no CLI), but
  imports like `import { createAgent } from 'agentonomous'` typecheck under
  TS 6 strict.

## Demo deployment

The browser demo is decoupled from npm releases. It auto-deploys to GitHub
Pages via `.github/workflows/pages.yml` on every push to the long-lived
`demo` branch (plus manual `workflow_dispatch` runs):

- URL: `https://<owner>.github.io/agentonomous/`
- Builds the library (`npm run build`), then the example (`cd
examples/product-demo && npm install && npm run build`), then uploads
  `examples/product-demo/dist` as the Pages artifact.
- The example's `vite.config.ts` reads `PAGES_BASE` at build time so assets
  resolve under the `/agentonomous/` subpath.

### Promoting `develop` → `demo`

When you want a new demo live, promote `develop` onto `demo` via a PR.
Branch protection on `demo` (see first-time setup below) blocks direct
pushes, so this is the required path:

1. Open a PR with base `demo`, head `develop`. Title: `demo: promote
develop @ <short-sha>`.
2. Wait for CI green. Reviews follow the same bar as `main`.
3. **Squash-merge** via the GitHub UI. That's the deploy trigger —
   `pages.yml` runs on the resulting push.

If protection is temporarily lifted and the histories haven't diverged,
a fast-forward also works:

```bash
git switch demo && git pull origin demo
git merge --ff-only develop
git push origin demo
```

Triggering a rebuild **without** advancing the branch (e.g. Pages
cleared its artifact, or you want to re-deploy the current tip): use
**Actions → Deploy demo to GitHub Pages → Run workflow** against the
`demo` branch. No push, no merge, no protection bypass needed.

First-time setup (one-off):

1. Repo → Settings → Pages → Source = **GitHub Actions**.
2. Create the `demo` branch from `develop` (`git switch -c demo develop &&
git push -u origin demo`) **before** enabling protection, so the
   initial push isn't blocked.
3. Add branch protection for `demo`: require PR, require CI green, disallow
   force-push. From this point on, promotions use the PR path above.
4. Repo → Settings → **Environments → `github-pages` → Deployment
   branches and tags** → add `demo` to the allowed list (or switch to
   "Protected branches only" now that `demo` is protected). GitHub
   creates this environment with `main` pre-allowed; the deploy job
   is rejected at the environment gate until `demo` is added.
5. Open the first promotion PR (or dispatch the workflow) and watch the
   `Deploy demo to GitHub Pages` workflow.

## Rolling back

If a broken version ships:

```bash
# Deprecate the broken version with a message pointing at the fix.
npm deprecate agentonomous@X.Y.Z "Broken release; upgrade to X.Y.(Z+1)"
```

Then publish the patch via the normal changeset flow. Never `npm unpublish`
— deprecated versions remain resolvable but warn consumers; unpublishing
breaks existing installs.
