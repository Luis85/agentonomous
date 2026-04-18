# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

Add a new changeset with:

```
npm run changeset
```

The CLI will prompt you for a semver bump (major / minor / patch) and a summary.
The resulting markdown file is committed alongside your PR. On release the files
are consumed to bump the version in `package.json`, update `CHANGELOG.md`, and
publish to npm via `npm run release`.
