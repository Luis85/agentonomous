# 2026-04-26 — Example favicon

## Goal

Ship a single, library-branded favicon (`agentonomous`) that every browser
example wires up automatically. Today there is exactly one HTML example
(`examples/nurture-pet`); the design must scale to additional examples
without per-example asset duplication.

## Non-goals

- Logo for README, npm, or social preview cards. Out of scope; this is a
  16×16/32×32 tab favicon only.
- PNG / ICO fallback for legacy browsers. SVG-only by user decision —
  evergreen browsers cover the demo audience.
- Touch-icon / Apple-touch-icon assets. Can be layered on later if a PWA
  posture is ever pursued.
- Wiring favicons into non-browser examples (`examples/llm-mock` is a
  Node CLI; it has no HTML surface).

## Asset

- **File:** `branding/favicon.svg`, single source of truth, ~600 bytes.
- **Format:** SVG, 32×32 viewBox.
- **Shape:** rounded square, corner radius 6 (≈19%).
- **Background fill:** `#4f46e5` (indigo — matches the demo's primary
  button color).
- **Glyph:** white lowercase `a`, geometric sans, optical weight ≈700,
  centered, x-height ≈ 60% of the square. Hand-built `<path>` so render is
  font-independent.
- **Theming:** identical in light + dark — indigo on white tab strips and
  on dark Chrome strips both render legibly without a color-scheme switch.

## Wiring

A small Vite plugin (`brandFaviconPlugin`) inlined in each example's
`vite.config.ts` handles both dev and build:

```ts
import { copyFileSync, readFileSync } from 'node:fs';

const FAVICON_SRC = resolve(here, '..', '..', 'branding', 'favicon.svg');

function brandFaviconPlugin() {
  return {
    name: 'agentonomous:brand-favicon',
    configureServer(server) {
      server.middlewares.use('/favicon.svg', (_req, res) => {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.end(readFileSync(FAVICON_SRC));
      });
    },
    closeBundle() {
      copyFileSync(FAVICON_SRC, resolve(here, 'dist', 'favicon.svg'));
    },
  };
}
```

- **Dev (`npm run dev`):** middleware serves the canonical asset at
  `/favicon.svg` on every request. No file is written into the example's
  source tree.
- **Build (`vite build`):** `closeBundle` copies the asset into the
  example's `dist/` so deployed bundles include it.
- **HTML wiring:** `<link rel="icon" type="image/svg+xml" href="favicon.svg" />`
  inside `<head>`. The relative `href` (no leading `/`) lets Vite's
  `base` prefix work for GitHub Pages deploys (`PAGES_BASE=/agentonomous/`).

### Why a Vite plugin and not `predev` / `prebuild` scripts

A pre-step would have to write a copy into `examples/<name>/public/favicon.svg`,
which then gets either committed (stale duplicate) or `.gitignore`-d
(invisible drift). The plugin keeps `branding/favicon.svg` as the single
on-disk artifact and keeps each example's source tree free of generated
files.

## Files changed

1. `branding/favicon.svg` — new, the canonical asset.
2. `branding/README.md` — new, ~3 lines: "Canonical agentonomous favicon.
   Examples wire it via a small Vite plugin in their `vite.config.ts`. See
   `examples/nurture-pet/vite.config.ts` for the reference implementation."
3. `examples/nurture-pet/vite.config.ts` — add `brandFaviconPlugin()` and
   register it in `defineConfig({ plugins: [...] })`.
4. `examples/nurture-pet/index.html` — add the `<link rel="icon" …>` line
   inside `<head>`.

No `.gitignore` change. No file inside any `examples/*/public/` directory.

## Verification

- `npm run verify` (root) green: format:check, lint, typecheck, test, build.
- Manual: `npm run demo:dev`, hard-refresh the tab, confirm the favicon
  renders in the browser tab strip in both light and dark themes.
- Manual: `cd examples/nurture-pet && npm run build`, confirm
  `examples/nurture-pet/dist/favicon.svg` exists post-build.
- GitHub Pages: deploys via the existing workflow without changes; only
  the `<link>` href + `closeBundle` copy are new, both already respect
  `PAGES_BASE`.

## Branch / PR / changeset

- **Branch:** `feat/favicon` (worktree `.worktrees/feat-favicon`).
- **PR target:** `develop`.
- **Changeset:** none. Pure example wiring + new branding asset; no library
  behavior change, so no semver bump owed.

## Future work (not in this PR)

- Factor `brandFaviconPlugin` into `examples/_shared/vite-plugins/` once a
  second HTML example exists. YAGNI for one consumer.
- Add `branding/logo.svg` (full wordmark, larger than the favicon) when a
  social-preview / npm card is needed. Out of scope here.
