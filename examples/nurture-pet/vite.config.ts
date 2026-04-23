import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Asset base path. Respects `PAGES_BASE` so the CI Pages workflow can serve
 * the demo from `/agentonomous/` when deployed at `user.github.io/agentonomous/`.
 * Locally (`npm run dev`), PAGES_BASE is unset and assets resolve from `/`.
 */
const base = process.env.PAGES_BASE ?? '/';

const here = fileURLToPath(new URL('.', import.meta.url));
const libDist = (subpath: string) => resolve(here, '..', '..', 'dist', subpath);

/**
 * Resolve `agentonomous` and its adapter subpaths against the library's built
 * `dist/`. Using an alias instead of a `file:../..` npm dep avoids npm
 * creating a self-nested junction on Windows (the link would live inside its
 * own target → libuv `EISDIR`). Consumers of the published package import via
 * the same specifiers, so runtime behaviour is equivalent. `npm run build` at
 * the repo root must have produced `dist/` before the demo can be served.
 *
 * Regex aliases (rather than string prefixes) so `agentonomous/…/brainjs`
 * isn't rewritten as `<index.js>/…/brainjs` via Vite's prefix substitution.
 */
const agentonomousAliases = [
  {
    find: /^agentonomous$/,
    replacement: libDist('index.js'),
  },
  {
    find: /^agentonomous\/cognition\/adapters\/brainjs$/,
    replacement: libDist('cognition/adapters/brainjs/index.js'),
  },
  {
    find: /^agentonomous\/cognition\/adapters\/mistreevous$/,
    replacement: libDist('cognition/adapters/mistreevous/index.js'),
  },
  {
    find: /^agentonomous\/cognition\/adapters\/js-son$/,
    replacement: libDist('cognition/adapters/js-son/index.js'),
  },
];

export default defineConfig({
  base,
  server: { port: 5173 },
  resolve: {
    alias: agentonomousAliases,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
