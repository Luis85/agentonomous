import { defineConfig } from 'vite';

/**
 * Asset base path. Respects `PAGES_BASE` so the CI Pages workflow can serve
 * the demo from `/agentonomous/` when deployed at `user.github.io/agentonomous/`.
 * Locally (`npm run dev`), PAGES_BASE is unset and assets resolve from `/`.
 */
const base = process.env.PAGES_BASE ?? '/';

export default defineConfig({
  base,
  server: { port: 5173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
