# agentonomous — Product Vision

> Companion to `docs/specs/overview.md` (technical spec) and
> `docs/specs/roadmap.md` (phased delivery). This document answers the
> "why" — the problem we solve, who we serve, and the invariants that
> guide every trade-off.

## Vision statement

**Give TypeScript developers a deterministic, engine-agnostic agent core
that turns simulations into living worlds — from a single pet you
nurture in a browser tab to a headless village of thousands — without
asking them to pick a rendering engine, an AI library, or a state
manager first.**

## The problem

Building believable, persistent, autonomous characters in a TypeScript
simulation today forces developers into one of three bad options:

1. **Roll your own.** Weeks of yak-shaving on needs decay, mood
   derivation, save/load, and determinism before any gameplay ships.
   Every project reinvents the same state machine.
2. **Adopt a game-engine-coupled framework.** Unity/Unreal equivalents
   exist but tie you to their editor, runtime, and content pipeline.
   Useless for headless simulations, browser games, or LLM-driven
   experiments.
3. **Glue together ad-hoc libraries.** A behavior-tree lib here, a
   state-machine lib there, a separate persistence layer, a separate
   RNG for determinism. Each seam leaks; none of it is designed to
   work together.

The result: most TypeScript games that *could* have rich autonomous
characters ship with scripted cutouts instead. Most research
simulations that *could* explore emergent behavior get stuck on
infrastructure. Most LLM-driven "agent" experiments can't be replayed
or debugged because nothing's deterministic.

Consumers who successfully ship living characters today either have
a team of 10+ or pay the roll-your-own tax. We want to remove that tax.

## Target personas

### P1 — The indie game developer

Ships a TypeScript + ExcaliburJS / PixiJS / three.js / plain-canvas
game. Wants a pet, an NPC shopkeeper, or a companion that feels alive
between the player's inputs. Has one weekend to prototype, one month
to polish. Does not want to study AI theory, state machines, or ECS
architecture to get something on screen.

**What success looks like for P1:** `npm install agentonomous`,
copy-paste the quickstart, see a reactive pet in under 20 minutes.
Add their own species via JSON when ready.

### P2 — The simulation researcher

Models social dynamics, emergent cooperation, or economic systems in
headless TypeScript. Needs byte-identical replays under a fixed seed,
snapshots they can diff, decision traces they can export to Jupyter.
Runs a thousand agents in parallel, not one.

**What success looks like for P2:** scripted replay test harness, RNG
port they control, `DecisionTrace` per tick, no hidden globals.
Integration with `sim-ecs` when needed (Phase B).

### P3 — The LLM / agent-framework builder

Building a next-gen agentic UI, a Claude-driven RPG, or a research
project that blends LLM reasoning with classical agent mechanics.
Needs an LLM provider port with prompt caching, strict budgets, and
deterministic mocking. Doesn't want to rewrite needs, mood, or
persistence themselves.

**What success looks like for P3:** drop in `LlmProviderPort` + their
provider of choice, use `MockLlmProvider` in tests, plug the library
into their existing event bus via adapters. LLM tool integration
(Phase B) treats non-determinism as a budget, not a bug.

## Product pillars

These are the invariants every feature must honor. Trade-offs flow
around them, not through them.

### 1. Determinism as a contract

Given a fixed `SeededRng` + `ManualClock`, every tick produces a
byte-identical `DecisionTrace`. This is testable, CI-enforced, and
ESLint-protected (no raw `Date.now` / `Math.random` /
`setTimeout` / `setInterval` in core). Breaking it is a breaking
change.

### 2. Ports & Adapters all the way down

Every source of non-determinism, every side effect, every IO boundary
is a port. `WallClock`, `Rng`, `Logger`, `EventBusPort`,
`SnapshotStorePort`, `RemoteController`, `ScriptedController`,
`MoodModel`, `Reasoner`, `BehaviorRunner`, `Learner`, `NeedsPolicy`,
`MemoryRepository`, `LlmProviderPort`. Every one of them has a
production adapter and a test double. Consumers own the edges.

### 3. Zero-config for the common case

`createAgent({ id, species })` must produce a working agent. In a
browser, it auto-persists to `localStorage`. In Node, it stays in
memory. In a reactive UI, `bindAgentToStore(agent, listener)` Just
Works with Pinia, Zustand, Redux, Svelte stores, or signals — no
framework dependency in core.

### 4. Species-agnostic, data-driven

No humanocentric primitives. A `SpeciesDescriptor` is JSON-editable.
A cat, a fish, a dragon, a Mars rover, a merchant NPC — all live in
the same abstraction. Designers edit species files without touching
TypeScript. Consumers compose; they don't subclass.

### 5. Engine-agnostic at the core, integration subpaths at the edge

The core bundle does not import a rendering engine, a physics engine,
or a specific ECS. Integrations (Excalibur today; sim-ecs,
three.js, PixiJS later) live behind subpath exports
(`agentonomous/integrations/<engine>`) so consumers only pay for
what they use.

### 6. Peer-optional brains

Advanced cognition adapters (`JsSonReasoner`, `MistreevousBehavior`,
`TfjsReasoner`, `AnthropicLlmProvider`, `OpenAiLlmProvider`) are
peer dependencies with `peerDependenciesMeta.optional: true`. Core
stays usable without any of them. Consumers opt in one at a time.

### 7. Tight feedback, emergent narrative

Every player-visible action emits an event with an `fxHint` the
renderer can consume. Every tick produces a `DecisionTrace` that
tells the story of why the agent did what it did. Consumers build
emergent narrative out of data, not hand-scripted sequences.

## What we build (feature pillars)

### Agent core

- Deterministic 10-stage tick pipeline (perceive → random events →
  modifiers → needs → mood → animation → control-mode dispatch →
  cognition → skills → persistence → trace).
- `createAgent(config)` ergonomic builder. `new Agent(deps)` for full
  control.
- Lifecycle: birth → growth → aging → death. Catch-up-aware on
  restore.
- Control modes: `autonomous` / `scripted` / `remote`. The same agent
  doubles as NPC, bot, or player-proxy.

### Subsystems

- **Needs**: homeostatic, configurable decay, urgency curves,
  critical thresholds.
- **Modifiers**: stackable buffs/debuffs, cross-cutting effects on
  needs / mood / skills / intention scoring / locomotion / lifespan.
- **Mood**: categorical, derived from needs + modifiers + persona.
- **Animation**: state machine driven by active skill + mood +
  modifiers. Decoupled from cognition.
- **Cognition**: `UrgencyReasoner` + `DirectBehaviorRunner` defaults,
  swappable for BDI / behavior-tree / LLM adapters.
- **Skills**: a default bundle (feed / clean / play / rest / pet /
  scold / medicate plus a few expressive reactions). Consumers add
  more via `SkillRegistry`.
- **Random events**: seeded per-tick probability table with
  cooldowns and guards.

### Persistence

- Versioned `AgentSnapshot` with per-subsystem slices.
- Auto-save via `AutoSavePolicy` (every N ticks + on critical events).
- `SnapshotStorePort` with `InMemory` / `LocalStorage` / `Fs`
  adapters. Consumer can plug IndexedDB, remote DB, or save slots.
- Offline catch-up: restore with elapsed time, deterministic
  sub-stepping.

### Reactive surface

- `agent.subscribe(listener)` — pub/sub over the event bus.
- `agent.getState()` — cheap frame-safe state slice.
- `bindAgentToStore(agent, listener)` — framework-agnostic binding.

### Integrations

- `agentonomous/integrations/excalibur` — Actor sync, remote
  controller, animation bridge.
- Planned: sim-ecs, three.js, PixiJS, Phaser (Phase B+).

## What we refuse to build

Calling these out now so they never show up as creeping scope.

- **Rendering.** We don't draw sprites. We emit state + events; the
  consumer's engine renders.
- **Physics or collision.** We track pose; we don't simulate bodies.
- **Pathfinding.** Locomotion is a mode string + speed multiplier;
  actual movement is the engine's job.
- **Multiplayer networking.** `RemoteController` is the seam.
  Consumers own the transport.
- **Editor UI / authoring tools.** Species files are JSON for a
  reason. Tools can come later as separate packages.
- **A specific AI / LLM opinion.** We expose ports; consumers pick
  providers.
- **A specific reactive framework opinion.** We expose `subscribe` +
  `getState`; consumers pick Pinia / Zustand / signals / whatever.

## Success metrics

### 6 months post-V1

- 1,000+ weekly npm downloads.
- 3+ community-published species descriptors.
- 2+ public browser games shipping an `agentonomous` pet or NPC.
- Zero reports of non-determinism in replay under fixed seed +
  ManualClock.
- GitHub Pages demo linked from README, working on mobile.

### 12 months

- Phase B complete (Markdown memory, jobs, social, LLM tool).
- First academic paper / blog post citing `agentonomous` for a
  simulation study.
- 5,000+ weekly npm downloads.
- Integration adapters shipped for at least one of: sim-ecs,
  three.js, PixiJS.
- First LLM-driven agent experiment using `LlmProviderPort` with
  prompt caching.

### 24 months

- Used as the agent layer in a commercial indie game on Steam / itch.
- Curriculum adoption: at least one university course references the
  determinism test harness as a reference implementation.
- Multi-agent coordination (Phase C) stable in production.
- 20,000+ weekly npm downloads.

## Principles that guide trade-offs

When two features pull in opposite directions, resolve by consulting
these in order.

1. **Determinism beats performance.** A microsecond slower tick is
   acceptable; a replay divergence is not.
2. **Contract clarity beats feature count.** A smaller API surface
   with crisp promises outperforms a kitchen sink with unclear
   semantics.
3. **Zero-config beats flexibility.** Consumers who need flexibility
   can opt in. Consumers who need "it just works" must not be
   penalized.
4. **Data beats code.** If a feature can be a JSON-editable
   descriptor, it is one.
5. **Ports beat embedding.** If core needs to reach out for
   something, it's a port, not a dependency.
6. **Peer-optional beats bundled.** Any library outside our own
   domain is a peer dep; core bundles nothing it doesn't strictly
   need.
7. **Small core beats big framework.** When in doubt, move it to an
   integration subpath or a separate package.

## Out of scope — forever

- Proprietary content bundling (sprite packs, sound effects, etc.).
  Content is the consumer's.
- Rendering loops, frame pacing, tweening, interpolation.
- A CLI or GUI binary. This is a library, always.
- Running on non-JS runtimes. TypeScript / JavaScript only.
- Supporting CommonJS. ESM-only, forever. TS 6+ agrees.

## How we measure "alive" in a simulation

The library succeeds when a consumer looks at their screen for 30
seconds without giving the pet any input and sees it do *something
interesting* — a meow, a mood shift, a stage transition, a random
event, a modifier expiring. The pet is alive when its autonomous
behavior fills the quiet between interactions. Every product decision
is weighed against that feeling.

## Relationship to other docs

- **`docs/specs/overview.md`** — the technical spec. How each of
  these pillars is implemented.
- **`docs/specs/roadmap.md`** — the phased path from today to the
  24-month horizon.
- **`docs/plans/review-remediation.md`** — the specific work needed
  to close the gap between current state and V1.0.0.
- **`/root/.claude/plans/i-want-to-create-warm-matsumoto.md`** — the
  internal planning document that drove the initial build.

## Signatures of success (anti-checklist)

How do we know we're building the right thing?

- A designer can add a new species without opening a TypeScript file.
- A researcher can re-run a simulation from six months ago and get
  byte-identical results.
- A Pinia user can bind an agent to their store in three lines.
- A consumer who doesn't care about LLMs never sees an LLM
  dependency.
- A nurture-pet demo runs at 60fps in Chrome on a five-year-old
  Android phone.
- Shutting the tab and reopening it restores the pet exactly where it
  was — including elapsed virtual time, modifiers that should have
  expired, and mood.

## Reviewing this document

This vision is meant to be stable across Phase A, B, and C. When a
proposed feature seems to contradict it, the feature gets refined, not
the vision. Changes to this document require:

1. A pull request with rationale.
2. Sign-off from project owner.
3. A corresponding update to `docs/specs/roadmap.md` showing how the
   change propagates.

Last reviewed: 2026-04-19. Next review: at V1.0.0 release.
