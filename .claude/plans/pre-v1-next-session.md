# Pre-v1 handoff — next session prompt

Paste the body below (between the `--8<--` markers) into a fresh Claude
Code session to pick up where we left off. The version-controlled copy of
this file lives at `.claude/plans/pre-v1-next-session.md` so the session
can re-read it directly with `Read`.

--8<-- COPY FROM HERE --8<--

## Where we are

`agentonomous` is a TypeScript library for autonomous agents in browser /
Node simulations. Phase A MVP is done and merged to `develop`:

- M0–M15 feature set complete (agent + tick pipeline + needs + modifiers +
  mood + lifecycle + cognition + skills + animation + control modes +
  persistence + random events + reactive store binding + Excalibur
  integration).
- R-01..R-27 remediation landed on `develop` (R-08 — per-subsystem
  snapshot versioning — was deferred).
- 288 vitest tests, strict TypeScript
  (`exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`), determinism
  enforced via ESLint.
- Dependencies freshly updated (ESLint 10, Vite 8, Vitest 4).
- Demo at `examples/nurture-pet` builds on Vite 8, persists to
  localStorage, has a life-summary modal.
- Claude Code environment set up: `CLAUDE.md`,
  `.claude/skills/{verify,scaffold-agent-skill,new-changeset}`,
  pre-allowlisted permissions.

Branch model: `main` (tagged releases) → `develop` (integration) →
short-lived topic branches. **Always PR against `develop`.** `main` and
`develop` are push-denied in `.claude/settings.json`.

Read first:

1. `CLAUDE.md` — non-negotiables, architecture map, common pitfalls.
2. `STYLE_GUIDE.md` — code style rules.
3. `CONTRIBUTING.md` — branch flow + commit conventions.

## Goal

Ship `v1.0.0`. Before the cut, land: richer features, a demo-speed
control, and a materially better demo UX.

## Priorities for this session (in order)

### P1 — Simulation speed control in the demo

The demo currently hard-codes `timeScale: 60` in
`examples/nurture-pet/src/main.ts`. Make it runtime-configurable:

1. Survey whether `Agent` already exposes a setter for `timeScale`. If
   not, add one (`agent.setTimeScale(scale: number): void`) on a topic
   branch — small, reversible. Audit `createAgent.ts` and the tick
   pipeline for where `timeScale` is consumed; it must be mutable without
   breaking determinism (i.e. the new scale applies from the NEXT tick
   onward, not retroactively).
2. Add a speed picker to the demo HUD with discrete buttons: **Pause**,
   **0.5×**, **1×**, **2×**, **4×**, **8×** (base = 60 virtual-s per
   real-s). Pause = timeScale 0 OR call `agent.halt()` — pick one and
   document why.
3. Persist the last-chosen speed in localStorage so it survives reload.
4. Unit test: `agent.setTimeScale(N)` then `tick(1)` → next tick uses
   new scale (seeded clock + rng).

Deliverables: one feature branch (`feat/timescale-control`),
library-side commit + demo-side commit, changeset (minor bump), PR to
`develop`.

### P2 — Demo UX improvements

The demo is functional but spartan. Pick 2–3 of these based on what you
can confidently land in scope:

- **Need meters** — color-coded bars with numeric overlays, not just
  text. Critical-threshold flash.
- **Modifier tray** — visible list of active modifiers with remaining
  time and a small icon. Use the existing `visual.hudIcon` field
  already on default modifiers.
- **Mood indicator** — categorical mood shown as label + emoji + subtle
  background tint. Current mood already exposed via `agent.getState()`.
- **Age / lifecycle stage** — human-readable ("Kitten — 23s old")
  instead of raw seconds.
- **Interaction feedback** — micro-animation on successful skill
  invoke (pulse / shake / tween). `SkillCompletedEvent.fxHint` already
  carries a hint string.
- **New Pet / Reset** button — gated behind a confirm dialog.
- **Export / Import snapshot** — JSON download + file-input upload.
  Uses existing `agent.snapshot()` + `agent.restore()`.

Do NOT try to do all of these in one PR. One or two well-landed
improvements beats six half-wired ones. Each goes on its own branch
(`feat/demo-need-meters`, `feat/demo-export-snapshot`, …).

### P3 — Pick one library depth item

Choose based on what unblocks downstream Phase B or what the demo will
expose first:

- **R-08 — per-subsystem snapshot versioning.** Deferred from Phase A.1.
  Wrap each subsystem slice in `{ version, state }` and plumb a
  migration registry. Biggest unlock: lets subsystems evolve
  independently without rewriting the monolithic `migrations/` entries.
  Scope it carefully — it's invasive. A design doc as the first commit
  would help.
- **Richer persona traits.** Currently `persona.traits` is a shallow
  `Record<string, number>` nudged by `PERSONA_TRAIT_WEIGHTS`. Concrete
  gap: traits should be able to modify need decay, not only intention
  scoring. Additive, low risk.
- **In-memory memory adapter.** Phase B originally flagged
  Markdown-based memory. A simple ring-buffer `MemoryPort` with a
  default in-memory adapter unlocks consumers without needing the file
  adapter yet. Self-contained.
- **Bundle-size trim.** Core is currently ~100 KB unminified (target
  ~80 KB). Run `npm run analyze`, identify the top offenders, split or
  lazy-load. Concrete, measurable, but can grow hair.

Pick ONE. Document the choice in the PR body.

## Hard constraints

- **Every PR runs `npm run verify` green before merge.** The skill
  `.claude/skills/verify/SKILL.md` wraps it.
- **Determinism contract is non-negotiable.** No `Date.now()` /
  `Math.random()` / `setTimeout` in `src/`. Use `WallClock`, `Rng`,
  ports.
- **No scope creep.** A demo-UX PR doesn't touch core library files. A
  library PR doesn't redesign the demo. Separate PRs, separate reviews.
- **Scaffolding a new skill?** Use `.claude/skills/scaffold-agent-skill`.
- **Adding a changeset?** Use `.claude/skills/new-changeset`. Minor bump
  for new API, patch for fixes, major only with migration notes.
- **Branch naming.** `feat/<slug>` / `fix/<slug>` / `refactor/<slug>` /
  `docs/<slug>` / `chore/<slug>`. PR against `develop`.
- **Do not push to `main` or `develop` directly.** The settings file
  denies those pushes, but don't even try.

## Out of scope for v1

- sim-ecs adapter
- LLM tool / OpenAI / Anthropic SDK integration
- Mistreevous BT adapter
- JS-son BDI adapter
- brain.js learning adapter
- Social / dialogue between multiple agents
- Markdown-backed memory file adapter

These are Phase B. If a task drifts toward any of them, stop and flag it
to the user.

## When you're done with this session

1. Summarize what landed in one paragraph + the open PR URLs.
2. Call out any items from P1–P3 that weren't addressed (with reason).
3. Suggest the next logical session's priorities. Keep it to three bullet
   points.

--8<-- COPY TO HERE --8<--

## Notes on using this prompt

- The session will be fresh — no memory of our conversation. This brief
  plus `CLAUDE.md` is the entire context it has. That's the point: if
  something critical isn't in here or in tracked files, it's invisible.
- If priorities shift (e.g., you decide to cut v1 sooner, or a bug
  report lands), edit this file before starting the next session. A
  stale handoff brief is worse than none.
- The `.claude/skills/*` are discoverable by name — the new session
  will see them listed and can invoke directly.
