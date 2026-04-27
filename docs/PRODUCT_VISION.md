# agentonomous — Product Vision

> This document answers the "why" — the problem we solve, who we serve,
> and the invariants that guide every trade-off.

## Vision statement

**Give TypeScript developers a deterministic, engine-agnostic agent core
that turns simulations into living worlds *and* drives real
software-development workflows — from a single pet you nurture in a
browser tab, to a headless village of thousands, to an agent that picks
up a ticket and runs it through review — without asking them to pick a
rendering engine, an AI library, or a state manager first.**

The arc is two versions long:

- **v1 — the basic agent (Phase A).** Deterministic tick pipeline,
  needs / mood / lifecycle / animation / skills / persistence. The
  virtual-pet demo proves the core. `LlmProviderPort` +
  `MockLlmProvider` ship for forward compatibility, but cognition stays
  classical.
- **v2 — the workflow-capable agent (Phase B, LLM-integrated).** The
  same agent, now wired to concrete LLM providers, becomes a first-class
  citizen of structured agentic workflows. It can be *aware of* a
  workflow, *orchestrate* it end-to-end, or *execute a single task* in a
  named role. The reference workflow is the
  [`agentic-workflow`](https://github.com/luis85/agentic-workflow) repo —
  a software-development pipeline of dedicated tasks and roles
  (planner / implementer / reviewer / releaser, etc.) that an
  `agentonomous` agent can pick up and run.

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

A fourth pain point joins them in v2 territory: today's
**software-development agent workflows** (issue triage, planning,
implementation, review, release) live as one-off prompt scripts welded
to a single LLM SDK. They have no persistent identity, no needs / mood
/ memory primitives, no deterministic replay, and no clean seam between
"orchestrate the workflow" and "execute a single task in role". Every
team rebuilds the same plumbing.

Consumers who successfully ship living characters — or reliable
agentic dev workflows — today either have a team of 10+ or pay the
roll-your-own tax. We want to remove that tax.

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

> Status: the `LlmProviderPort` contract + `MockLlmProvider` ship in
> 1.0 — see `examples/llm-mock/` for the deterministic playback
> end-to-end. Concrete `AnthropicLlmProvider` / `OpenAiLlmProvider`
> adapters land in Phase B; existing consumers pick them up additively.

### P4 — The agentic-workflow author *(v2 / Phase B)*

Maintains a structured software-development workflow (planning,
implementation, code review, release) as a graph of dedicated tasks
and roles — the [`agentic-workflow`](https://github.com/luis85/agentic-workflow)
repo is the reference shape. Wants to drop a real, persistent agent
into one of those roles — not a stateless prompt — so that the agent
remembers prior runs, has shaped behavior (mood, modifiers, skill
selection), and can be replayed deterministically when something goes
wrong. Sometimes wants the agent to orchestrate the whole pipeline;
sometimes wants it to execute exactly one task and hand back.

**What success looks like for P4:** an agent loads a workflow
descriptor, binds itself to a role (or to the orchestrator role),
exposes that role's tasks as `Skill`s, and runs the pipeline against a
real Anthropic / OpenAI provider. The same agent definition runs
deterministically against `MockLlmProvider` in CI. Workflow runs
produce diff-able `DecisionTrace`s and resumable snapshots — a crashed
review run picks up where it left off, not from scratch.

> Status: P4 is the headline v2 use case. v1 ships the primitives the
> workflow needs (Skills, persistence, deterministic tick, LLM port).
> v2 — driven by Phase B's concrete LLM adapters plus the
> workflow-orchestrator subsystem (see "Workflow execution" below) —
> turns those primitives into a first-class workflow runtime.

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

### 8. One agent, two surfaces: simulation *and* workflow

The same `Agent` that nurtures a virtual pet can pick up a role in a
software-development workflow. We do not fork the runtime — workflows
are an *additional surface area* over the v1 core: a workflow is a
graph of tasks; a role binds tasks to `Skill`s; orchestration is a
control mode. If something needs a separate runtime to make workflows
work, the v1 core is wrong and we fix v1, not bolt on v2.

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

### Workflow execution *(v2 / Phase B)*

Once concrete LLM adapters land, the same agent core grows a
**workflow surface** that consumes structured agentic workflows like
[`agentic-workflow`](https://github.com/luis85/agentic-workflow). The
goal is *not* a separate "workflow engine" package — it's a thin layer
over the existing primitives.

Three modes, one agent:

1. **Aware.** The agent loads a workflow descriptor as data and
   answers questions about it ("which task am I on?", "what's the
   exit criterion of the current step?", "what role am I bound to?").
   Workflows live as JSON / Markdown descriptors, not as code in the
   library.
2. **Orchestrate.** The agent is bound to the orchestrator role and
   walks the workflow graph end-to-end: it dispatches tasks to other
   agents (or to itself in a different role) via `RemoteController`,
   gates transitions on task results, and persists progress in its
   `AgentSnapshot` so a crash mid-pipeline is resumable.
3. **Execute.** The agent is bound to a single role
   (planner / implementer / reviewer / releaser / …) and exposes that
   role's tasks as `Skill`s. The cognition layer picks the next task
   the same way it picks "feed" vs "play" today — urgency reasoning
   over inputs from the workflow context.

Building blocks that already exist in v1 and carry over:

- `Skill` + `SkillRegistry` → workflow tasks are skills.
- `Modifier` system → "blocked on review", "rate-limited", "budget
  exhausted" become first-class debuffs that gate skill selection.
- `AgentSnapshot` + `SnapshotStorePort` → workflow state survives
  restarts; resumable runs are the default, not the exception.
- `DecisionTrace` → every workflow step produces an auditable trace.
  A failed run is a diff against a previous successful one.
- `LlmProviderPort` + `MockLlmProvider` → workflow runs are
  CI-replayable against the mock; production swaps in
  `AnthropicLlmProvider` / `OpenAiLlmProvider` without code changes.

What v2 adds (Phase B scope, not v1):

- `WorkflowDescriptor` + `WorkflowRunner` — parser + traversal over the
  external workflow shape.
- `RoleBinding` — declarative mapping from workflow roles to skill
  bundles + cognition tuning.
- A workflow-aware `RemoteController` adapter so an orchestrator agent
  can dispatch to executor agents over whatever transport the consumer
  picks (in-process, IPC, HTTP).
- An end-to-end example: the `agentic-workflow` repo's
  software-development pipeline, driven from `examples/agentic-workflow/`,
  shipping a real PR against a sample repo deterministically against
  the mock provider.

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

### 12 months *(v2 milestone)*

- Phase B complete (Markdown memory, jobs, social, LLM tool,
  concrete `AnthropicLlmProvider` / `OpenAiLlmProvider`).
- **Workflow surface shipped**: `WorkflowDescriptor`, `WorkflowRunner`,
  `RoleBinding`, plus an end-to-end `examples/agentic-workflow/` that
  drives the [`agentic-workflow`](https://github.com/luis85/agentic-workflow)
  pipeline against `MockLlmProvider` deterministically and against a
  real provider for live runs.
- First external team running the v2 agent in CI as their PR-review
  or release-prep automation.
- First academic paper / blog post citing `agentonomous` for a
  simulation study.
- 5,000+ weekly npm downloads.
- Integration adapters shipped for at least one of: sim-ecs,
  three.js, PixiJS.

### 24 months

- Used as the agent layer in a commercial indie game on Steam / itch.
- Used as the agent layer in a production software-development
  workflow (orchestrator + executor agents) at one or more teams,
  with crash-resumable runs and replayable traces.
- Curriculum adoption: at least one university course references the
  determinism test harness as a reference implementation.
- Multi-agent coordination (Phase C) stable in production — including
  multi-agent workflow runs where roles are filled by distinct agent
  processes.
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

- **[`agentic-workflow`](https://github.com/luis85/agentic-workflow)** —
  external companion repo. Defines the structured
  software-development workflow (tasks + roles) that v2 / Phase B
  agents will consume. The contract that lives there is the
  authoring surface; the runtime that executes it lives here. Changes
  to the workflow shape feed into v2 design via the
  `WorkflowDescriptor` schema.

## Signatures of success (anti-checklist)

How do we know we're building the right thing?

- A designer can add a new species without opening a TypeScript file.
- A researcher can re-run a simulation from six months ago and get
  byte-identical results.
- A Pinia user can bind an agent to their store in three lines.
- A consumer who doesn't care about LLMs never sees an LLM
  dependency.
- A pet-care demo runs at 60fps in Chrome on a five-year-old
  Android phone.
- Shutting the tab and reopening it restores the pet exactly where it
  was — including elapsed virtual time, modifiers that should have
  expired, and mood.

For v2 specifically:

- A `agentic-workflow` author writes a workflow descriptor *once* and
  runs it under both `MockLlmProvider` (in CI, deterministic) and
  `AnthropicLlmProvider` (in production, live) without changing the
  agent definition.
- An orchestrator agent's run crashes mid-pipeline, restarts, and
  resumes from the last persisted task — no double-executed tasks, no
  lost progress.
- A reviewer-role agent can be swapped out for a different cognition
  adapter (urgency / behavior tree / LLM) without touching the
  workflow descriptor.
- The same agent that nurtures the pet in the demo can be re-bound to
  a workflow role and execute a real software-development task — same
  runtime, different skills.

## Reviewing this document

This vision is meant to be stable across Phase A, B, and C. When a
proposed feature seems to contradict it, the feature gets refined, not
the vision. Changes to this document require:

1. A pull request with rationale.
2. Sign-off from project owner.

Last reviewed: 2026-04-26 (refined to introduce the v1 → v2 arc and
the [`agentic-workflow`](https://github.com/luis85/agentic-workflow)
companion repo as the v2 reference workflow). Next review: when the
pre-1.0 polish-and-harden roadmap closes (see
`docs/plans/2026-04-25-comprehensive-polish-and-harden.md`), or when
the first `WorkflowDescriptor` design spec opens against Phase B —
whichever comes first.
