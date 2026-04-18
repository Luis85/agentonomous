# Publishing

Release flow for `agentonomous`.

## Prerequisites

- npm account with publish rights to the `agentonomous` package.
- `NPM_TOKEN` secret configured in GitHub Actions (Settings → Secrets → Actions).
  The token must be an **automation token** (not a classic publish token) so
  npm's provenance attestation works.
- `main` branch protected; releases happen only via Changesets PRs landing on
  `main`.

## Local dry runs

Before shipping anything, verify the package looks right:

```bash
# Run the full pre-publish gate (format, lint, typecheck, test, build).
npm run verify

# Inspect what npm would actually publish.
npm run pack:dry
```

`pack:dry` prints the exact file list + tarball size. Only `dist/`,
`README.md`, and `LICENSE` should appear (per the `files` field in
`package.json`).

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

1. If unreleased changesets exist, the workflow opens (or updates) a
   `chore(release): version packages` PR that bumps `package.json`, updates
   `CHANGELOG.md`, and consumes the changeset files.
2. Merging that PR into `main` re-triggers the workflow, which now has no
   pending changesets and instead runs `npm run release` (`changeset
publish` → `npm publish`).
3. npm provenance is attested automatically (`publishConfig.provenance: true`
   - `id-token: write` permission in the workflow + GitHub's OIDC token).

No manual `npm publish` calls are needed in the normal path.

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

Separate from npm publishing, the browser demo auto-deploys to GitHub Pages
via `.github/workflows/pages.yml` on every push to `main`:

- URL: `https://<owner>.github.io/agentonomous/`
- Builds the library (`npm run build`), then the example (`cd
examples/nurture-pet && npm install && npm run build`), then uploads
  `examples/nurture-pet/dist` as the Pages artifact.
- The example's `vite.config.ts` reads `PAGES_BASE` at build time so assets
  resolve under the `/agentonomous/` subpath.

First-time setup (one-off):

1. Repo → Settings → Pages → Source = **GitHub Actions**.
2. Push to `main` and watch the `Deploy demo to GitHub Pages` workflow.

## Rolling back

If a broken version ships:

```bash
# Deprecate the broken version with a message pointing at the fix.
npm deprecate agentonomous@X.Y.Z "Broken release; upgrade to X.Y.(Z+1)"
```

Then publish the patch via the normal changeset flow. Never `npm unpublish`
— deprecated versions remain resolvable but warn consumers; unpublishing
breaks existing installs.
