# Pre-v1 Demo Evolution — Design Document

Spec date: 2026-04-26
Tracker PR: [#129](https://github.com/Luis85/agentonomous/pull/129)
Companion docs:
- Planning doc: [`docs/product/2026-04-26-pre-v1-demo-evolution-plan.md`](../product/2026-04-26-pre-v1-demo-evolution-plan.md)
- Spec: [`2026-04-26-pre-v1-demo-evolution-spec.md`](./2026-04-26-pre-v1-demo-evolution-spec.md)
- Plans: see [Tracker table](../product/2026-04-26-pre-v1-demo-evolution-plan.md#tracker-table)

## Context and scope

The planning doc fixes the **what** (5 product pillars + demo rename) and the
**why** (post-`develop` baseline → pre-v1 demo "v2"). The spec fixes the
**testable requirements** per pillar. **This design document fixes the
cross-cutting how**: the demo application shell, the layering rules every
pillar must respect, and the inter-pillar contracts that prevent five
parallel implementation tracks from each inventing its own version of the
same primitive.

It is intentionally narrower than the spec: things that vary per pillar
(specific FRs, acceptance criteria, copy, edge cases) live in the spec or
in the per-pillar plan. Things that, if decided independently per pillar,
would produce divergent or incompatible code (store layering, route
shape, fingerprint normalization rules, persistence namespacing, DDD
boundaries) live here.

The design assumes the **pre-v1 policy** declared in the planning doc:
no compatibility shims, no preserved persistence shapes, no transitional
APIs. Determinism and testability remain non-negotiable.

## Demo application shell architecture

### Stack (locked by planning doc)

- **Vue 3 Single-File Components (`.vue`)** — UI composition. SFC-first;
  no string templates or render-function-first components by default.
- **Vue Router 4** — multi-view navigation (intro, free-play, guided
  tour, diff panel, replay report).
- **Pinia 2** — application state orchestration. Layered (see below);
  not a second domain model.
- **Vite** — already in use for the existing demo; no change.
- **Vitest** — already in use for unit + component tests; reused.
- **Playwright** — added for end-to-end tour + replay scripts.

### Folder layout (under `examples/product-demo/src/`)

```
examples/product-demo/src/
├── app/                       # bootstrap, root component, router/pinia install
│   ├── App.vue
│   ├── main.ts
│   └── routerPlugin.ts
├── routes/                    # route definitions + per-route guards
│   └── index.ts
├── views/                     # one .vue per top-level route
│   ├── IntroView.vue
│   ├── PlayView.vue           # /play and /play/:scenarioId
│   ├── TourView.vue           # /tour/:step?
│   ├── DiffView.vue           # /diff
│   └── ReplayView.vue         # /replay
├── components/                # presentational SFCs reused across views
│   ├── trace/
│   ├── tour/
│   ├── diff/
│   ├── fingerprint/
│   ├── config/
│   └── shell/                 # layout primitives (header, nav, panel)
├── stores/
│   ├── domain/                # use-case adapters around `agentonomous`
│   │   ├── useAgentSession.ts
│   │   ├── useScenarioCatalog.ts
│   │   ├── useFingerprintRecorder.ts
│   │   └── useConfigDraft.ts
│   └── view/                  # UI-only state (no domain logic)
│       ├── useTourProgress.ts
│       ├── useDiffPanelView.ts
│       ├── useJsonEditorView.ts
│       └── useShellLayout.ts
├── composables/               # cross-cutting hooks (router-aware, focus, a11y)
├── demo-domain/               # demo-specific domain modules (NOT in `agentonomous`)
│   ├── scenarios/             # Scenario contract impls (pet-care, companion-npc)
│   ├── walkthrough/           # step-graph definitions + completion predicates
│   ├── diff/                  # rolling-window metric helpers
│   ├── fingerprint/           # normalizer + hash function
│   └── config/                # whitelisted-field schema + validator
├── copy/                      # English-only UI strings, grouped by pillar
└── styles/                    # tokens, layout, component overrides
```

`examples/product-demo/` replaces `examples/nurture-pet/` per the rename
preflight slice (Wave 0). Until that ships, treat the existing path as the
working copy and apply this layout under the new name once renamed.

### Build + dev commands (unchanged contract, renamed targets)

The root npm scripts already proxy into the demo workspace
(`demo:install`, `demo:dev`, `demo:build`). The rename plan in the
planning doc updates those proxies; nothing else changes about the
command contract. Vite library build of `agentonomous` still runs first;
the demo resolves it via the same `tsconfig` alias path it does today.

## Vue Router map

Every visible surface of the demo is a route. Tour state, scenario id,
and replay reports are URL-addressable so a presenter can deep-link or
share a scoped run during a live demo.

| Path | View | Purpose | Notes |
|---|---|---|---|
| `/` | `IntroView` | Landing + entry CTAs ("Start guided tour", "Skip to free-play") | Reads `useTourProgress` to relabel CTA when tour completed. |
| `/play` | `PlayView` | Free-play shell, default scenario | Redirects to `/play/:scenarioId` of the current `useScenarioCatalog.activeId`. |
| `/play/:scenarioId` | `PlayView` | Free-play in a named scenario | Route guard: `scenarioId` must exist in `useScenarioCatalog`. |
| `/tour/:step?` | `TourView` | Guided walkthrough; `:step` defaults to `useTourProgress.lastStep ?? 1` | Scoped to the active scenario. |
| `/diff` | `DiffView` | Cognition behavior-difference panel | Optional `?since=<tickCount>` for scoped windows. |
| `/replay` | `ReplayView` | Determinism fingerprint badge + report | Optional `?seed=&mode=&config=&scenario=` for sharable scope keys. |

### Route guards

- **Tour resumption guard** (`/tour`): if no active session exists,
  initialize it deterministically from the tour's known-good seed before
  rendering the step.
- **Scenario validity guard** (`/play/:scenarioId`): if the id is not in
  `useScenarioCatalog.list()`, redirect to `/play` and surface a
  one-tick toast.
- **Fingerprint scope guard** (`/replay`): if the URL's scope key cannot
  be hydrated against current registry shapes, render an
  "Insufficient sample" badge with an explanation rather than throwing.

### Navigation discipline

- Components do **not** call `router.push` directly for domain transitions
  (e.g., scenario change). Domain stores expose `goTo*` methods that
  wrap router navigation. This keeps the navigation contract testable
  headless without mounting the router.

## Pinia store layering

Stores split along a strict line:

- **Domain stores** (`stores/domain/`) wrap `agentonomous` use-cases and
  the demo's own `demo-domain/` modules. They hold canonical truth (the
  active session, the catalog of scenarios, the recorded fingerprints,
  the editable config draft). They are testable headless using
  `SeededRng` + `ManualClock` exactly like core engine code.
- **View stores** (`stores/view/`) hold UI-only state (which panels are
  collapsed, which tour step is being rendered, which JSON tab is active).
  They never own simulation state. They consume domain stores read-only.

| Store | Layer | Purpose | Public actions (selected) | Persists | Peer deps |
|---|---|---|---|---|---|
| `useAgentSession` | domain | Owns the live `Agent` + tick loop + control mode | `start`, `pause`, `resume`, `step(n)`, `setSpeed`, `replayFromSnapshot`, `subscribe` | `demo.v2.session.lastSeed`, `demo.v2.session.mode` | none |
| `useScenarioCatalog` | domain | Registers + activates `Scenario` instances | `list`, `activeId`, `setActive(id)`, `getScopeKeyComponent()` | `demo.v2.scenario.activeId` | `useAgentSession` |
| `useFingerprintRecorder` | domain | Records canonical run fingerprints + verdicts | `beginWindow(scope)`, `recordTick(trace)`, `verdict()`, `report()` | `demo.v2.fingerprint.knownGood` (per scope key) | `useAgentSession`, `useScenarioCatalog` |
| `useConfigDraft` | domain | Holds the in-flight JSON config draft + preview state | `loadFromActive`, `setField(path, value)`, `preview`, `revert`, `commit` | `demo.v2.config.committed` | `useAgentSession` |
| `useTourProgress` | view | Step graph cursor + completion flags | `start`, `next`, `skip`, `restart`, `markComplete(stepId)` | `demo.v2.tour.progress` | reads `useAgentSession` |
| `useDiffPanelView` | view | Panel collapse, metric selection | `toggleExpanded`, `setActiveMetricSet` | `demo.v2.diffView.collapsed` | reads `useFingerprintRecorder`, `useAgentSession` |
| `useJsonEditorView` | view | Editor tab + diff-summary visibility | `setTab`, `toggleDiffSummary` | `demo.v2.jsonView.tab` | reads `useConfigDraft` |
| `useShellLayout` | view | Header/nav layout state, focus-restore hooks | `setNavOpen`, `pushFocusTrap` | none | none |

### Cross-store coordination rules

- A scenario change (`useScenarioCatalog.setActive`) MUST trigger
  `useAgentSession.replayFromSnapshot(null)` (fresh init under that
  scenario's seed scope) and `useFingerprintRecorder.beginWindow(...)`
  with the new scope key. The orchestrator lives in
  `useScenarioCatalog`; views never wire this manually.
- A cognition mode change (handled inside `useAgentSession`) MUST emit
  the new mode id into the fingerprint recorder's scope key derivation.
- A successful `useConfigDraft.commit()` MUST trigger a session restart
  with the new config and a fresh fingerprint window. Preview operations
  MUST NOT touch fingerprint state.

These coordination rules are enforced in domain-store unit tests, not
left to component logic.

## DDD layering

```
┌─────────────────────────────────────────────────────────────────┐
│ Presentation: views/ + components/                              │
│   may import: stores/domain (read-only via getters), stores/view│
│   may NOT import: agentonomous/*, demo-domain/* (directly)      │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ Application: stores/domain + stores/view                        │
│   stores/domain may import: agentonomous, demo-domain           │
│   stores/view may import: stores/domain (read-only)             │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ Domain: demo-domain/ + agentonomous (npm package)               │
│   pure modules, no Vue, no Pinia, no DOM                        │
│   tested with SeededRng + ManualClock; deterministic            │
└─────────────────────────────────────────────────────────────────┘
```

### Forbidden imports (enforceable via ESLint `no-restricted-imports`)

| From | May not import |
|---|---|
| `components/**` | `agentonomous`, `examples/product-demo/src/demo-domain/**` |
| `views/**` | `examples/product-demo/src/demo-domain/**` (use stores instead) |
| `demo-domain/**` | `vue`, `pinia`, `vue-router`, `@vueuse/*`, anything DOM-aware |
| `stores/view/**` | `agentonomous`, `demo-domain/**` |

The rename slice adds these rules to the demo workspace's ESLint config
so the boundary is enforced from the first downstream PR.

## Cross-pillar contracts

These types are the integration points between pillars. They are defined
in `demo-domain/` (pure TypeScript, no Vue) so every pillar's plan
references the same shape.

### `Scenario`

```ts
export type ScenarioId = string & { readonly __brand: 'ScenarioId' };

export type Scenario = {
  readonly id: ScenarioId;
  readonly displayName: string;
  readonly narrative: string;            // one-paragraph in-product description
  readonly seedScope: SeedScope;         // contributes to fingerprint key
  readonly skillBundle: SkillBundle;     // built atop agentonomous skill registry
  readonly configSchema: ConfigSchema;   // declares previewable + commit-only fields
  readonly initialAgentSpec: AgentSpec;  // species, lifecycle, default needs/mood
};
```

A scenario is the unit of "swap the demo into a different behavioral
domain". The `pet-care` scenario is the existing nurture-pet loop;
`companion-npc` is the second-scenario reference (concept revisable in
its pillar plan kickoff).

### `WalkthroughStep`

```ts
export type WalkthroughStep = {
  readonly id: WalkthroughStepId;
  readonly chapter: 1 | 2 | 3 | 4 | 5;
  readonly title: string;
  readonly hint: string;                 // one-line action prompt
  readonly highlight: SelectorHandle;    // logical handle, not raw CSS
  readonly completionPredicate: (ctx: TourCtx) => boolean;
  readonly nextOnComplete: WalkthroughStepId | 'end';
};

export type TourCtx = {
  readonly session: AgentSessionSnapshot;  // read-only projection of useAgentSession
  readonly route: RouteContext;
};
```

Selector handles (`SelectorHandle`) are looked up in a per-component
registry so changing markup does not silently break the tour.

### `DiffMetric`

```ts
export type DiffMetric<T> = {
  readonly id: DiffMetricId;
  readonly label: string;
  readonly windowTicks: number;          // bounded ring buffer
  readonly minSampleSize: number;        // confidence floor
  readonly observe: (tick: AgentTick) => void;
  readonly snapshot: () => DiffMetricSnapshot<T>;
  readonly reset: () => void;
};
```

The four planning-doc metrics (top-intention frequency, skill-invocation
distribution, urgency-gap mean, interruption/reactivity markers) all
implement `DiffMetric<T>` and live in `demo-domain/diff/`.

### `RunFingerprint` and `FingerprintScope`

```ts
export type FingerprintScope = {
  readonly seed: number;
  readonly scenarioId: ScenarioId;
  readonly cognitionModeId: string;
  readonly configHash: string;           // hash of normalized committed config
  readonly windowTicks: number;
};

export type FingerprintScopeKey = string;  // deterministic encoding of FingerprintScope

export type RunFingerprint = {
  readonly scope: FingerprintScope;
  readonly digest: string;               // hash over the normalized tick stream
  readonly verdict: 'matched' | 'diverged' | 'insufficient-sample';
};
```

### `ConfigDraft`

```ts
export type ConfigDraft = {
  readonly source: 'committed' | 'previewing';
  readonly committed: NormalizedConfig;
  readonly draft: NormalizedConfig;
  readonly previewable: ReadonlySet<ConfigPath>;
  readonly invalid: ReadonlyArray<ValidationFinding>;
};
```

`previewable` is a runtime restatement of the schema's
preview-allowlist; commit-only fields trigger
`Commit + Restart (persisted)` rather than `Preview (session-only)`.

## Determinism fingerprint design

### Normalized inputs (hashed)

In strict order:

1. `FingerprintScope` (canonical JSON).
2. For each tick `t` in `[startTick, startTick + windowTicks)`, a
   serialized `NormalizedTickRecord` containing **only**:
   - `t.tickIndex` (relative to `startTick`)
   - `t.decisionTrace.candidateIds` (sorted, stable)
   - `t.decisionTrace.selectedId`
   - `t.decisionTrace.urgencyById` (sorted by id, rounded to 6 decimals)
   - `t.skillInvocations.map(({ id, outcome }) => ({ id, outcome }))`
   - `t.needsAfter` (sorted by need id, rounded to 6 decimals)
   - `t.moodAfter`
   - `t.lifecycleStage`

### Excluded inputs (never hashed)

- Wall-clock timestamps (everything is virtual time via `ManualClock`).
- Animation frame counters and reconciliation transient state.
- Any field whose value depends on listener registration order or
  `setImmediate`-style microtask scheduling.
- Modifier instance ids (use `modifier.kind` instead).

### Hash function

`sha-256` over the normalized stream, truncated to first 128 bits and
hex-encoded. Decision is in the design (not the pillar plan) because the
hash function and truncation are part of the contract: any change is a
breaking redefinition of every persisted "known-good" digest. The
truncation length is a deliberate trade-off — long enough to make
collisions astronomically unlikely for demo-scale windows, short enough
to fit in a copy-paste replay report.

### Verdict logic

- `digest === knownGoodDigest` → `matched`.
- `digest !== knownGoodDigest` → `diverged`.
- `tickCount < FingerprintScope.windowTicks * minSampleFraction` →
  `insufficient-sample`. (`minSampleFraction = 0.95` initially; tunable
  in the pillar plan.)
- A scope key with no recorded `knownGoodDigest` records the current
  digest as the new known-good and reports `matched`. This is what makes
  the very first run of a freshly-scoped session pass.

## Persistence and storage keys

### Namespace

All keys live under the prefix `demo.v2.`. The `v2` segment is **not** a
migration target — it exists to make pre-v1 vs post-v1 keys visually
distinguishable in DevTools and in any logs. The pre-v1 policy explicitly
permits redefining shapes, so no migration shim is added for legacy
`nurture-pet.*` or `demo.*` keys; the rename preflight slice deletes
them on first load and emits a one-line console notice in dev mode only.

### Key inventory

| Key | Owner | Shape | Reset behavior |
|---|---|---|---|
| `demo.v2.session.lastSeed` | `useAgentSession` | `number` | cleared by "new seed" UI |
| `demo.v2.session.mode` | `useAgentSession` | `string` | persists across reloads |
| `demo.v2.scenario.activeId` | `useScenarioCatalog` | `ScenarioId` | defaults to `pet-care` |
| `demo.v2.fingerprint.knownGood` | `useFingerprintRecorder` | `Record<FingerprintScopeKey, string>` (digest) | per-scope eviction on commit |
| `demo.v2.config.committed` | `useConfigDraft` | `NormalizedConfig` (per scenario) | overwritten by commit |
| `demo.v2.tour.progress` | `useTourProgress` | `{ lastStep, completedAt }` | cleared by restart |
| `demo.v2.diffView.collapsed` | `useDiffPanelView` | `boolean` | UI-only |
| `demo.v2.jsonView.tab` | `useJsonEditorView` | `string` | UI-only |

### Versioning

Each persisted shape is wrapped in `{ v: 1, data: ... }` at write time.
A read-time mismatch on `v` discards the value and re-initializes — no
migrators. Pre-v1 means we can ship breaking shape changes without
back-compat code; the version field is purely defensive against a
half-applied write.

## Testing strategy

### Domain stores (Vitest, headless)

`stores/domain/*` test files live under
`examples/product-demo/test/stores/domain/` and follow the same
seed-everything pattern as core engine tests:

- `SeededRng(<literal>)` for any RNG flowing into `useAgentSession`.
- `ManualClock(<literal>)` for time advancement; never `Date.now()`.
- Assertions on event streams + selector outputs, never on protected
  internals.

### View stores (Vitest + `@pinia/testing`)

`stores/view/*` tests verify UI state transitions only. Domain stores
are stubbed with `createTestingPinia({ initialState: ... })`; the test
asserts the view store reacts correctly to projected snapshots without
booting an `Agent`.

### Components (Vue Test Utils smoke tests)

One smoke test per top-level component verifying it renders without
console warnings against a stubbed store, and that key user actions
dispatch the expected store call. Visual regressions are out of scope
this increment.

### End-to-end (Playwright)

Three named scripts shipped this increment:

1. `tour-happy-path.spec.ts` — completes all 5 chapters from a cold
   start; asserts no dead-end states.
2. `replay-determinism.spec.ts` — runs the tour's known-good script
   twice and asserts the fingerprint badge reaches `matched` both times.
3. `scenario-swap.spec.ts` — swaps `pet-care ↔ companion-npc` mid-run
   and asserts both scenarios remain deterministic under their own
   scope keys.

Playwright runs in CI on the same matrix as `npm run verify` and is
gated behind a new `npm run e2e` script (added in the rename preflight
slice so all later PRs can rely on it).

### Determinism gates

A repository-wide ESLint rule (extending the existing one) extends the
`no-raw-time` ban into `examples/product-demo/src/demo-domain/`. The
rest of `examples/product-demo/src/` is allowed `Date.now()` for UI
purposes (e.g., debounce), but `demo-domain/` and `stores/domain/` are
not.

## Open questions (deferred to pillar plans)

- **Walkthrough copy tone** — locked in pillar 1 plan kickoff; design
  only fixes the step-graph + completion-predicate contract.
- **`companion-npc` behavioral signature** — concept locked in the spec
  as the reference scenario; specific needs/skills revisable during the
  second-scenario plan kickoff (per option **u** locked in brainstorm).
- **`minSampleFraction` for the "insufficient" verdict** — initial value
  of `0.95` in this design is a starting point; the fingerprint pillar
  plan tunes it against soak data.
- **Diff metric confidence label thresholds** — the four metrics ship
  with placeholder thresholds; pillar 2's plan tunes them after the
  first soak run.
