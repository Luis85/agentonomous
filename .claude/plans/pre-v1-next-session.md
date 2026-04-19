# Pre-v1 handoff

## Where we are

`agentonomous` is a TypeScript library for autonomous agents in browser /
Node simulations. Phase A MVP is complete and all work so far has landed on
`develop` but we want to further polish what we have as this is not polished enough for a well received demo.

**What shipped last session (on the branch above):**

- `Agent.setTimeScale(scale)` / `Agent.getTimeScale()` — runtime-mutable
  wall→virtual multiplier. Typed `InvalidTimeScaleError` (code
  `E_INVALID_TIME_SCALE`). 5 new vitest cases. Changeset (minor bump).
- Demo speed picker: Pause / 0.5× / 1× / 2× / 4× / 8×. localStorage-
  persisted. Pause uses `setTimeScale(0)`; `kill(reason)` is still the
  terminal death gate.
- Demo modifier tray with `Modifier.visual.hudIcon` + remaining-time
  countdown. Pause-aware ("paused" badge instead of wall-clock countdown).
- Humanized age/stage display (`STAGE_LABELS` + `formatAge`).
- Reset flow: confirm-gated HUD button + "🔄 New pet" in death modal.
  Clears snapshot from `localStorage`, reloads; speed preference survives.
- 293 vitest tests pass (`npm run verify` green). Demo builds clean.

**Known deferred items from the review (see improvement plan below).**

Branch model: `main` (tagged releases) → `develop` (integration) →
short-lived topic branches. **Always PR against `develop`.** `main` and
`develop` are push-denied in `.claude/settings.json`.

Read first:

1. `CLAUDE.md` — non-negotiables, architecture map, common pitfalls.
2. `STYLE_GUIDE.md` — code style rules.
3. `CONTRIBUTING.md` — branch flow + commit conventions.

---

## Priority 1 — Fix snapshot × setTimeScale interaction (blocker for v1)

**Why first:** `restore({ catchUp: true })` silently uses the _current_
agent's `timeScale` (not the snapshotted one). A consumer who snapshots at
scale 60 and rehydrates with a fresh agent at scale 1 gets divergent
catch-up. Snapshot schema doesn't persist `timeScale` at all.

**Steps:**

1. Read `src/agent/Agent.ts` lines 622–640 (restore catch-up) and
   `src/persistence/AgentSnapshot.ts` (schema).
2. Add `timeScale?: number` to `AgentSnapshot`. Bump `schemaVersion`.
   Add a migration entry that sets `timeScale` to `undefined` (meaning:
   use constructor value) for old snapshots — this preserves backward
   compat without mandating a value.
3. In `restore()`, apply `snapshot.timeScale` (if present) before the
   catch-up block, so the catch-up uses the original scale.
4. Add test: snapshot agent at scale 4, restore into agent at scale 1
   with `catchUp: true`, assert the catch-up virtual advance is scaled by
   4 (not 1).
5. Add test: `setTimeScale(0)` then `restore({ catchUp: true })` →
   no error, no NaN in trace (runCatchUp already guards this, but make
   the contract explicit).
6. Changeset (minor bump — snapshot schema change).

**Related:** this is the groundwork for **R-08 per-subsystem snapshot
versioning** (each slice in `{ version, state }`). R-08 is still
invasive; treat it as a separate PR that builds on this one.

---

## Priority 2 — Resolve "freeze" semantics of setTimeScale(0)

**Why:** when paused, modifier expiry, mood reconciliation, and animation
transitions still advance on wall-clock time. The demo works around this
with the "paused" badge label, but the underlying asymmetry is a design
debt. This also affects Phase B use cases (scripted playback, UI-paused
cutscenes).

**Design choice to make first** (propose a short design note as first
commit):

- **Option A:** Special-case `scale === 0` in `tick()` to skip Stage 2
  (`ModifiersTicker`), Stage 2.7 (`MoodReconciler`), and Stage 2.8
  (`AnimationReconciler`). Clean from a user perspective; slight
  added complexity in the tick pipeline.
- **Option B:** Re-base modifier expiry on virtual time (`virtualNowSeconds`)
  rather than wall-clock `tickStartedAt`. More consistent long-term;
  breaking change for consumers who relied on wall-clock expiry.

Recommendation: implement Option A for now (it's additive, no breaking
change). File a CLAUDE.md note explaining the Option B path for Phase B.

---

## Priority 3 — Demo UX: snapshot Export / Import

**Why:** closes the last meaningful P2 item from the original session
brief. Lets users save / share pet state as JSON files.

**Steps:**

1. In `ui.ts`, add `mountExportImport(agent)` — two HUD buttons:
   - "💾 Export" — calls `agent.snapshot()`, serializes to JSON, triggers
     `<a download="whiskers.json">` click. Pure DOM, no fetch.
   - "📂 Import" — hidden `<input type="file" accept=".json">`, on change
     reads file as text, parses JSON, calls
     `agent.restore(snapshot, { catchUp: false })`. Errors surfaced as an
     `alert()` for now.
2. Wire in `main.ts`. Add a DOM anchor point in `index.html`.
3. No library changes needed — `snapshot()` and `restore()` already exist.
4. Demo-only PR, no changeset.

---

## Remaining deferred items (descending priority)

These did not make it into the implementation plan above; address them in
subsequent sessions or as small follow-up PRs:

| ID  | Description                                                                                        | Severity |
| --- | -------------------------------------------------------------------------------------------------- | -------- |
| D1  | Expose `getTimeScale()` on `AgentFacade` (`src/agent/AgentFacade.ts`)                              | 🟡       |
| D2  | Determinism proof: parallel-agent test asserting byte-identical traces across `setTimeScale` calls | 🟡       |
| D3  | Modifier chips show dev-facing IDs; add a `Modifier.visual.label?` field or a demo label map       | 🟡       |
| D4  | `localStorage` key prefix: `whiskers:speed` vs library `agentonomous/` convention                  | 🟢       |
| D5  | Speed-picker visual hierarchy competes with critical-need flash; move below bars                   | 🟢       |
| D6  | Dead `#pet-age` div (now empty) — remove from `index.html`                                         | 🟢       |
| D7  | `formatRemaining` vs `formatAge` spacing inconsistency (`1m30s` vs `1m 30s`)                       | 🟢       |
| D8  | R-08 per-subsystem snapshot versioning (invasive; design doc first)                                | post-v1  |
| D9  | Bundle-size trim — `dist/index.js` is 102 KB unminified (target ~80 KB)                            | post-v1  |
| D10 | Richer persona traits that modify need decay rates, not only intention scoring                     | post-v1  |

---

## Hard constraints (unchanged)

- **Every PR runs `npm run verify` green before merge.**
- **Determinism contract:** no `Date.now()` / `Math.random()` / `setTimeout`
  in `src/`. Use `WallClock`, `Rng`, ports.
- **No scope creep:** library PRs don't touch demo; demo PRs don't touch lib.
- **Branch naming:** `feat/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…`.
  PRs target `develop`.
- **No push to `main` or `develop` directly.**

## In-Scope for the MVP Demo

Mistreevous BTs, JS-son BDI, brain.js learning

## Out of scope for v1

sim-ecs adapter, LLM / OpenAI / Anthropic SDK integration, social/multi-agent dialogue,
Markdown-backed memory file adapter. These are Phase B.
