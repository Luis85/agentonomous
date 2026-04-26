---
name: Vite HTML transform rewrites only publicDir-resolved root-relative URLs
description: Vite's HTML transform leaves bare-relative hrefs untouched and only prefixes `base` onto root-relative URLs that resolve to existing files in `publicDir`; closeBundle-emitted assets are never rewritten. Affects favicon/asset wiring in examples/.
type: feedback
originSessionId: 10ae7a32-2d50-4ea8-a67a-f1d0e8167796
---

When wiring a static asset into an example's `index.html`, do NOT claim Vite will rewrite the href against `base` (e.g. `PAGES_BASE=/agentonomous/`) unless the asset actually lives in `publicDir` (default `<root>/public/`) at HTML-transform time.

- **Bare-relative `href="favicon.svg"`** → Vite never rewrites it. `dist/index.html` keeps the literal string. Browsers resolve at runtime against the document URL, which on GH Pages becomes `https://user.github.io/agentonomous/favicon.svg`. This works, but `dist/index.html` does not visibly reflect the deployed path.
- **Root-relative `href="/favicon.svg"`** → Vite rewrites to `/agentonomous/favicon.svg` ONLY if the path resolves to an actual file in `publicDir` at transform time (`checkPublicFile` in Vite source). A plugin-emitted asset written via `closeBundle` does NOT live in `publicDir` and will NOT be rewritten — the literal `/favicon.svg` stays in `dist/index.html` and 404s on GH Pages.

**Why:** Spec for the favicon PR (#120, branch `feat/favicon`, 2026-04-26) originally said "Vite rewrites the relative href against `base`". Implementer subagent caught the mismatch by reading Vite 8 source (`assetUrlRE`, `checkPublicFile`) — both forms tested empirically. Doc-only fix (`5b7677e`) corrected spec + plan to describe browser-side relative-URL resolution. Three other examples-/plugin-style PRs in this repo will likely hit the same trap.

**How to apply:**

- For plugin-emitted assets (the agentonomous pattern: canonical source + Vite plugin with dev middleware + `closeBundle` copy), use **bare-relative href** and document that the browser resolves it at runtime against the page URL. Don't promise Vite will rewrite anything.
- If you genuinely want Vite to rewrite to `base` (so `dist/index.html` is self-explanatory), put the asset in the example's `public/` dir AND use a root-relative href. That requires committing the asset into the example tree, which contradicts the "single source of truth" goal.
- Third option: a `transformIndexHtml` hook that prepends `config.base` itself. More plugin code, but produces self-explanatory dist HTML. Reserve for cases where deploy-path visibility matters more than plugin simplicity.
- When writing specs/plans for asset wiring, describe the actual mechanism precisely (publicDir-resolution + browser-side resolution). Vague "Vite handles `base`" claims cause spec-compliance loops with reviewer subagents.
