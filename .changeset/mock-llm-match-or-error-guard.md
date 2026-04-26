---
'agentonomous': patch
---

`MockLlmProvider`: when `dispatch: 'match-or-error'` is set, the constructor now throws if any script lacks a `match` predicate. Previously, such scripts were silently unreachable and only surfaced as a generic `no script matched the request.` error at first call. The new error names the offending index.
