> **Archived 2026-04-26.** Completed in #120.

# Example Favicon Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a library-branded SVG favicon (`agentonomous`) wired into every browser example via a small Vite plugin, with `branding/favicon.svg` as the single source of truth.

**Architecture:** Canonical SVG at `branding/favicon.svg`. Each browser example's `vite.config.ts` registers a small `brandFaviconPlugin()` that (a) serves the asset at `/favicon.svg` in dev via a middleware and (b) copies it into the example's `dist/` on `closeBundle` for production builds. The example's HTML references it with a bare-relative `href` (`favicon.svg`); browsers resolve it against the document URL at runtime, so both `localhost:5173/` and the GitHub Pages deploy at `https://user.github.io/agentonomous/` fetch the asset correctly without any Vite-side rewrite (Vite only rewrites root-relative URLs resolving to files in `publicDir`, which this plugin doesn't use). Today only `examples/nurture-pet/` is wired; `examples/llm-mock/` is a Node CLI with no HTML and is out of scope.

**Tech Stack:** SVG, Vite 8 plugin API, Node 22 ESM, `node:fs`/`node:path`.

**Spec:** `docs/specs/2026-04-26-example-favicon.md`. Read before starting.

## File structure

- **Create:** `branding/favicon.svg` — the canonical asset, ≤700 bytes.
- **Create:** `branding/README.md` — short note describing source-of-truth + Vite-plugin wiring.
- **Modify:** `examples/nurture-pet/vite.config.ts` — add `brandFaviconPlugin()` + register it in `defineConfig({ plugins: [...] })`.
- **Modify:** `examples/nurture-pet/index.html` — add `<link rel="icon" …>` inside `<head>`.

No `.gitignore` change. No file committed to `examples/nurture-pet/public/`.

---

## Chunk 1: Asset + branding doc

### Task 1: Create canonical SVG favicon

**Files:**
- Create: `branding/favicon.svg`

- [ ] **Step 1: Write the SVG file**

Contents (exact bytes):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="agentonomous">
  <rect width="32" height="32" rx="6" fill="#4f46e5"/>
  <path fill="#fff" fill-rule="evenodd" d="M8 18a6 6 0 1 0 12 0 6 6 0 1 0-12 0Zm3 0a3 3 0 1 1 6 0 3 3 0 1 1-6 0ZM19 11h4v13h-4z"/>
</svg>
```

The `<path>` is hand-built: an annular bowl (outer circle r=6 minus inner circle r=3, joined with `fill-rule="evenodd"`) for the rounded counter, plus a 4×13 right-stem rectangle. Reads as a geometric lowercase `a` at favicon sizes without depending on a system font.

- [ ] **Step 2: Verify the file size**

Run: `node -e "console.log(require('node:fs').statSync('branding/favicon.svg').size)"`
Expected: a number ≤ 700.

- [ ] **Step 3: Visually verify the glyph**

Open `branding/favicon.svg` directly in a browser (e.g. `start branding/favicon.svg` on Windows, `open …` on macOS).
Expected: an indigo rounded square with a white lowercase `a` (annular bowl + right stem), centered.

- [ ] **Step 4: Commit**

```bash
git add branding/favicon.svg
git commit -m "feat(branding): add canonical agentonomous favicon

Single SVG (indigo #4f46e5 rounded square + white lowercase 'a' as
hand-built path: annular bowl + right stem). Source of truth for
every browser example; wiring follows in subsequent commits."
```

---

### Task 2: Document the branding directory

**Files:**
- Create: `branding/README.md`

- [ ] **Step 1: Write the README**

Contents:

```markdown
# branding/

Canonical visual assets for the `agentonomous` library.

- `favicon.svg` — 32×32 SVG favicon (indigo rounded square + white
  lowercase `a`). Browser examples wire it up via a small Vite plugin in
  their `vite.config.ts`; see
  `examples/nurture-pet/vite.config.ts` for the reference implementation.
  Do not copy this file into example source trees — the plugin serves it
  in dev (middleware at `/favicon.svg`) and writes it to `dist/` on
  build, so a checked-in copy would only drift.
```

- [ ] **Step 2: Commit**

```bash
git add branding/README.md
git commit -m "docs(branding): describe favicon source-of-truth wiring"
```

---

## Chunk 2: Vite plugin + HTML link

### Task 3: Register `brandFaviconPlugin` in nurture-pet's Vite config

**Files:**
- Modify: `examples/nurture-pet/vite.config.ts`

- [ ] **Step 1: Add imports**

Insert at the top of the file (after the existing imports):

```ts
import { copyFileSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
```

- [ ] **Step 2: Add the `FAVICON_SRC` constant + plugin function**

Insert below the existing `libDist` helper (before `agentonomousAliases`):

```ts
const FAVICON_SRC = resolve(here, '..', '..', 'branding', 'favicon.svg');

/**
 * Serves the canonical agentonomous favicon (branding/favicon.svg) without
 * committing a copy into the example's source tree.
 *
 * - Dev: middleware streams the file at /favicon.svg.
 * - Build: closeBundle copies it into dist/favicon.svg so the deployed
 *   bundle includes it.
 */
function brandFaviconPlugin(): Plugin {
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

- [ ] **Step 3: Register the plugin in `defineConfig`**

Modify the existing `defineConfig({ … })` to add a `plugins` field. Final shape:

```ts
export default defineConfig({
  base,
  server: { port: 5173 },
  plugins: [brandFaviconPlugin()],
  resolve: {
    alias: agentonomousAliases,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 4: Typecheck the example config**

Run from the repo root: `npm run typecheck`
Expected: PASS. The Vite config is included in the project's `tsc --noEmit` graph and must compile without errors.

- [ ] **Step 5: Build the demo and verify `dist/favicon.svg` exists**

The library must be built first (the example aliases `agentonomous` to `../../dist/`).

Run from the repo root:

```bash
npm run build
cd examples/nurture-pet
npm run build
ls dist/favicon.svg
```

Expected: `dist/favicon.svg` exists. Also verify it is byte-identical to the canonical asset:

```bash
diff -q ../../branding/favicon.svg dist/favicon.svg
```

Expected: no output (files match).

- [ ] **Step 6: Commit**

```bash
git add examples/nurture-pet/vite.config.ts
git commit -m "feat(demo): wire agentonomous favicon via Vite plugin

Adds brandFaviconPlugin to examples/nurture-pet/vite.config.ts. Dev
middleware serves branding/favicon.svg at /favicon.svg; closeBundle
copies it into dist/ on build. Single source of truth; nothing is
written into examples/nurture-pet/public/."
```

---

### Task 4: Reference the favicon from `index.html`

**Files:**
- Modify: `examples/nurture-pet/index.html`

- [ ] **Step 1: Add the `<link>` tag inside `<head>`**

Insert after the existing `<meta name="viewport" …>` line and before the `<title>`:

```html
<link rel="icon" type="image/svg+xml" href="favicon.svg" />
```

Note: bare-relative `href` (no leading `/`). Vite leaves bare-relative
URLs untouched in the HTML transform (it only rewrites root-relative
URLs that resolve to files in `publicDir`, which this plugin doesn't
use). Runtime behavior is correct anyway: a page served at
`https://user.github.io/agentonomous/index.html` resolves the relative
href to `https://user.github.io/agentonomous/favicon.svg`, which is
where `closeBundle` wrote the asset. No Vite rewrite involved.

- [ ] **Step 2: Verify the build leaves the href bare-relative**

Run from `examples/nurture-pet/`:

```bash
npm run build
grep favicon dist/index.html
```

Expected output line:

```
<link rel="icon" type="image/svg+xml" href="favicon.svg" />
```

The href is unchanged from `index.html` source — Vite does not rewrite
bare-relative URLs. Browsers resolve it against the document URL at
runtime, which is what makes both `localhost:5173/` and
`user.github.io/agentonomous/` work without per-deployment build
arguments.

- [ ] **Step 3: Commit**

```bash
git add examples/nurture-pet/index.html
git commit -m "feat(demo): reference agentonomous favicon from index.html"
```

---

## Chunk 3: Verify + open PR

### Task 5: Run pre-PR gate, manual smoke, open PR

- [ ] **Step 1: Run the full gate from the repo root**

Run: `npm run verify`
Expected: format:check, lint, typecheck, test, build all PASS.

If any stage fails, fix the cause in a new commit on `feat/favicon` — do NOT use `--no-verify`. Re-run `npm run verify` until green.

- [ ] **Step 2: Manual smoke test**

Run from repo root: `npm run demo:dev`
Open http://localhost:5173/.
Expected: the browser tab shows an indigo square with a white `a`. Hard-refresh (Ctrl+Shift+R / Cmd+Shift+R) to bypass any cached default favicon.
Switch to OS dark mode and reload. Expected: same favicon, still legible (indigo on the dark tab strip).

If the favicon does not render, check the dev server console for `/favicon.svg` requests — the middleware should log a 200. If you see a 404, the plugin is not registered; recheck Task 3 Step 3.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/favicon
```

- [ ] **Step 4: Open the PR against `develop`**

```bash
gh pr create --base develop --title "feat(demo): add agentonomous favicon for browser examples" --body "$(cat <<'EOF'
## Summary
- Adds canonical `branding/favicon.svg` (indigo rounded square + white lowercase `a`, hand-built path).
- Wires it through `examples/nurture-pet` via a small Vite plugin: dev middleware + build-time copy into `dist/`.
- References it from `examples/nurture-pet/index.html` with a bare-relative `href`; browsers resolve it against the document URL at runtime so both `localhost:5173/` and the GitHub Pages deploy fetch it correctly without a build-time rewrite.
- No `public/favicon.svg` committed in the example — `branding/` is the single source of truth.

Spec: `docs/specs/2026-04-26-example-favicon.md`.
Plan: `docs/plans/2026-04-26-example-favicon.md`.

No changeset: pure example wiring + new branding asset; no library behavior change.

## Test plan
- [ ] `npm run verify` is green.
- [ ] `npm run demo:dev` shows the favicon in the browser tab in light + dark mode.
- [ ] `cd examples/nurture-pet && npm run build && grep favicon dist/index.html` prints `favicon.svg` (bare-relative is intentional — see plan Task 4).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Arm Codex polling**

After the `@codex review` workflow fires (auto-triggered by PR open), arm a 5-minute cron poll loop per the project's standing rule (`feedback_pr_codex_polling`). Stop on findings or approval comment.

---

## Notes for executor

- **Worktree:** This plan is meant to run inside `.worktrees/feat-favicon/` on branch `feat/favicon`. Do not edit `develop` directly.
- **Determinism:** Nothing here interacts with the deterministic tick pipeline. Library `src/` is untouched. No new use of `Date.now()`, `Math.random()`, or `setTimeout`.
- **Out of scope (explicitly):**
  - PNG/ICO fallbacks.
  - Touch-icon / Apple-touch-icon assets.
  - Wiring favicons into `examples/llm-mock/` (Node CLI, no HTML).
  - Factoring `brandFaviconPlugin` into `examples/_shared/` (deferred until a second HTML example exists — see spec "Future work").
