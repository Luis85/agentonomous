import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { copyFileSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Asset base path. Respects `PAGES_BASE` so the CI Pages workflow can serve
 * the demo from `/agentonomous/` when deployed at `user.github.io/agentonomous/`.
 * Locally (`npm run dev`), PAGES_BASE is unset and assets resolve from `/`.
 */
const base = process.env.PAGES_BASE ?? '/';

const here = fileURLToPath(new URL('.', import.meta.url));
const libDist = (subpath: string) => resolve(here, '..', '..', 'dist', subpath);

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

/**
 * Resolve `agentonomous` and its adapter subpaths against the library's built
 * `dist/`. Using an alias instead of a `file:../..` npm dep avoids npm
 * creating a self-nested junction on Windows (the link would live inside its
 * own target → libuv `EISDIR`). Consumers of the published package import via
 * the same specifiers, so runtime behaviour is equivalent. `npm run build` at
 * the repo root must have produced `dist/` before the demo can be served.
 *
 * Regex aliases (rather than string prefixes) so `agentonomous/…/tfjs`
 * isn't rewritten as `<index.js>/…/tfjs` via Vite's prefix substitution.
 */
const agentonomousAliases = [
  {
    find: /^agentonomous$/,
    replacement: libDist('index.js'),
  },
  {
    find: /^agentonomous\/cognition\/adapters\/mistreevous$/,
    replacement: libDist('cognition/adapters/mistreevous/index.js'),
  },
  {
    find: /^agentonomous\/cognition\/adapters\/js-son$/,
    replacement: libDist('cognition/adapters/js-son/index.js'),
  },
  {
    find: /^agentonomous\/cognition\/adapters\/tfjs$/,
    replacement: libDist('cognition/adapters/tfjs/index.js'),
  },
];

export default defineConfig({
  base,
  server: { port: 5173 },
  plugins: [vue(), brandFaviconPlugin()],
  resolve: {
    alias: agentonomousAliases,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
