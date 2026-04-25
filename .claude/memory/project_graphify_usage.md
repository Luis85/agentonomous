---
name: Graphify knowledge graph for codebase navigation
description: This repo ships a graphify knowledge graph at `graphify-out/`. Consult `GRAPH_REPORT.md` before answering architecture / cross-module questions or starting any non-trivial code review.
type: project
---

The repo carries a committed graphify knowledge graph under
`graphify-out/`. It catalogues god nodes, community structure,
cross-module dependencies, and INFERRED edges that are not visible from
a flat grep of the source.

The full ruleset is also reflected in the root
[`CLAUDE.md`](../../CLAUDE.md) `## graphify` section — this memory
exists so non-Claude assistants and human reviewers see it too.

**Why:** Grep finds string matches; the graph captures relationships.
Cross-module "how does X relate to Y" questions resolve in one
traversal instead of N rounds of grep. Skipping the graph leads to
shallow reviews that miss indirect coupling and reinvents conclusions
already encoded in `GRAPH_REPORT.md`.

**How to apply:**

- **Before any architecture or codebase question**, read
  `graphify-out/GRAPH_REPORT.md` for god nodes and community structure.
- **Before any non-trivial code review**, scan `GRAPH_REPORT.md` for
  the touched modules' communities and known god nodes — review
  comments anchored to graph context land cleaner than grep-shaped
  ones.
- If `graphify-out/wiki/index.md` exists, navigate it instead of
  reading raw source files.
- For cross-module "how does X relate to Y" questions, prefer the
  graphify CLI over grep — it traverses the EXTRACTED + INFERRED
  edges instead of scanning files line-by-line:
  ```bash
  graphify query "<question>"
  graphify path "<A>" "<B>"
  graphify explain "<concept>"
  ```
- After modifying source files in a session, run
  `graphify update .` to keep the graph current. The update is
  AST-only — no API cost, safe to run frequently.

**What's checked in:** `graph.html`, `graph.json`, `GRAPH_REPORT.md`,
and the wiki under `graphify-out/wiki/`. Heavy / regeneratable
artefacts (cache, manifest, per-node Obsidian vault, Cypher dump,
GraphML / SVG exports) are gitignored — see `.gitignore` for the full
list.
