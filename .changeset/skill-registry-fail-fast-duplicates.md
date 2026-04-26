---
'agentonomous': minor
---

Breaking: `SkillRegistry.register()` now throws `DuplicateSkillError` when
a skill with the same id is already registered. A new
`SkillRegistry.replace(skill)` method is the explicit API for intentional
overrides — `register()` no longer silently overwrites.

`createAgent`'s module-skill auto-install now follows two precedence
rules: consumer-pre-registered skills take precedence over module
defaults (silent skip for that id — consumer wins), but a skill
contributed by two different modules (or listed twice in one module)
still throws `DuplicateSkillError`. Module-vs-module collisions are
exactly the "my module X silently clobbers module Y's skill" bugs
this PR exists to surface; only the consumer override case is
silenced.

**Migration**

- If you were silently overwriting a registered skill, switch to
  `registry.replace(skill)` — intent is now explicit.
- If you were doubly-registering the same skill (e.g. both
  pre-registering a module's skills AND passing the module via
  `createAgent({ modules })`), drop the redundant pre-registration —
  `createAgent` now installs the module's skills automatically and
  skips ones you've already registered.

**Rationale**

Silent overwrites were the most common root cause of "my skill works in
isolation but not when I add module X" bugs. Fail-fast surfaces the
conflict at registration time where the fix is obvious, rather than
deep in a later tick when the "wrong" skill runs.
