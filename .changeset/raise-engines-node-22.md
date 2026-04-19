---
'agentonomous': minor
---

Raise `engines.node` to `>=22`.

CI now validates on Node 22 only; previously `engines` advertised `>=20.18`
while CI stopped covering Node 20 on the preceding PR. Aligning the two
closes the gap where a Node 22-only API could slip through without CI
catching it. Consumers on Node 20 should upgrade to Node 22 (active LTS).
