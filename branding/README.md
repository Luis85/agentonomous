# branding/

Canonical visual assets for the `agentonomous` library.

- `favicon.svg` — 32×32 SVG favicon (indigo rounded square + white
  lowercase `a`). Browser examples wire it up via a small Vite plugin in
  their `vite.config.ts`; see
  `examples/product-demo/vite.config.ts` for the reference implementation.
  Do not copy this file into example source trees — the plugin serves it
  in dev (middleware at `/favicon.svg`) and writes it to `dist/` on
  build, so a checked-in copy would only drift.
