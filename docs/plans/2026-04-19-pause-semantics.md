# Pause semantics for `setTimeScale(0)`

Status: **Option A adopted for Phase A**. Option B is the documented
Phase B upgrade path.

## Problem

`Agent.setTimeScale(0)` was introduced as a soft pause — virtual-time
progress (needs decay, aging, random events) halts without the terminal
effects of `kill(reason)`. However, three reconciliation stages still run
every wall-clock tick at scale 0:

| Stage | Component             | Driven by                  |
| ----- | --------------------- | -------------------------- |
| 2     | `ModifiersTicker`     | wall-clock `tickStartedAt` |
| 2.7   | `MoodReconciler`      | wall-clock `tickStartedAt` |
| 2.8   | `AnimationReconciler` | wall-clock `tickStartedAt` |

A paused pet therefore still emits `ModifierExpired`,
`MoodChanged`, and `AnimationTransition` events. The nurture-pet demo
works around this with a "paused" HUD badge, but the underlying
asymmetry surprises consumers (scripted playback, UI-paused cutscenes)
and leaks wall-clock-driven state changes into what consumers reasonably
expect to be a frozen snapshot of the agent.

## Option A — Skip reconciliation stages at scale 0 (Phase A)

- **Change:** `tick()` short-circuits Stages 2, 2.7, and 2.8 when
  `this.timeScale === 0`. Other stages (perception drain, autosave,
  cognition dispatch) still run — scripted and remote controllers can
  drive actions during a pause because they don't rely on virtual dt.
- **Modifier expiry semantics:** `expiresAt` remains an absolute
  wall-clock ms. If a modifier would have expired during a pause,
  `ModifiersTicker` detects it on the first post-resume tick and emits
  `ModifierExpired` then — the event is deferred, not cancelled, and
  not duplicated. This matches how consumers already treat the tick as
  the unit of observable state change.
- **Animation:** `AnimationStateMachine.current()` is unchanged during a
  pause; no `AnimationTransition` fires. Rotation that _would have_ been
  triggered by dwelling in a state past `minDwellMs` resumes on the
  first post-resume tick.
- **Mood:** category stays latched until the next post-resume
  reconciliation.
- **Additive, no breaking change.** Consumers that don't pause see
  identical behaviour.

## Option B — Virtual-time-based reconciliation (Phase B)

- **Change:** re-base `expiresAt`, `minDwellMs`, and mood reconciliation
  windows on `virtualNowSeconds` instead of wall-clock `tickStartedAt`.
- **Implication:** pausing genuinely _extends_ modifier lifetimes —
  `expiresAt` becomes a virtual-time cursor and doesn't advance while
  the agent is paused.
- **Breaking change.** Consumers who relied on `Modifier.expiresAt`
  being an absolute wall-clock ms (e.g. HUD countdowns computed as
  `expiresAt - wallNow`) must migrate to `virtualExpiresAt - virtualNow`.
- **Tracking:** revisit alongside R-08 per-subsystem snapshot
  versioning, since the modifier snapshot shape changes too.

## Why Option A now

- No schema change, no consumer migration, no new field.
- Closes the "paused pets still emit events" bug for the demo path and
  Phase B's scripted-playback use cases.
- Preserves the existing `Modifier.expiresAt` contract. Option B's
  shift can be planned deliberately once virtual-time exposure in the
  public API is ready.
