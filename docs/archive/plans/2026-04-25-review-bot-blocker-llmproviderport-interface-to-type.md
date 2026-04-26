---
date: 2026-04-25
slug: review-bot-blocker-llmproviderport-interface-to-type
finding-id: 682b557.1
tracker: '#87'
severity: BLOCKER
---

# Fix review finding `682b557.1` — interface→type sweep across `src/`

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every `interface` declaration in `src/` to a `type` alias and lock in the invariant via ESLint, so downstream consumers cannot silently widen library contracts via declaration merging.

**Architecture:** Pure refactor — no runtime change. Each `export interface X { … }` becomes `export type X = { … };`. Each `interface A extends B { … }` becomes `type A = B & { … };`. ESLint rule `@typescript-eslint/consistent-type-definitions: ['error', 'type']` is added first so the failure surface is mechanically enumerable; we then convert one directory at a time, committing per directory so Codex review chunks stay small.

**Tech Stack:** TypeScript 5.x strict, ESLint 9 flat config, vitest, prettier, husky pre-commit.

---

## Source — bot finding (verbatim)

From `#87` comment 4319403042, finding `682b557.1`:

> **[BLOCKER]** `src/ports/LlmProviderPort.ts` — interface→type sweep across 16 declarations
>
> **Problem:** 16 data-shape `interface` declarations across `src/` where the repo invariant requires `type`.
>
> **Why it matters:** `interface` enables TypeScript declaration merging — a downstream consumer can add fields to `LlmMessage` or `TfjsLearnerOptions` in their own `.d.ts`, silently widening the contract. Library code that assumes the type is closed may accept shapes it cannot handle, producing late-binding surprises that only surface at call sites far removed from the augmenting declaration.
>
> Affected locations the bot enumerated:
>
> | File | Interfaces |
> |---|---|
> | `src/ports/LlmProviderPort.ts:22,29,38,49,68,78` | `LlmCacheHint`, `LlmMessage`, `LlmBudget`, `LlmCompleteOptions`, `LlmUsage`, `LlmCompletion` |
> | `src/ports/MockLlmProvider.ts:13,25` | `MockLlmScript`, `MockLlmProviderOptions` |
> | `src/agent/internal/agentDepsResolver.ts:38,54,82,105` | `ResolvedPorts`, `ResolvedSubsystems`, `ResolvedCognition`, `ResolvedPersistence` |
> | `src/agent/internal/buildAgentDeps.ts:41` | `ResolvedDeps` |
> | `src/cognition/adapters/tfjs/TfjsLearner.ts:8,15` | `TrainableReasoner<In,Out>`, `TfjsLearnerOptions<In,Out>` |
> | `src/agent/createAgent.ts:50` | `CreateAgentConfig` |
> | `src/persistence/LocalStorageSnapshotStore.ts:23` | `LocalStorageSnapshotStoreOptions` |
>
> **Fix** (apply pattern to all 16):
>
> ```diff
> -export interface LlmCacheHint {
> -  readonly key: string;
> -}
> +export type LlmCacheHint = {
> +  readonly key: string;
> +};
> ```
>
> To prevent recurrence, add to `eslint.config.js`:
>
> ```diff
> +'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
> ```

## Why scope expands beyond the bot's 16

`@typescript-eslint/consistent-type-definitions: ['error', 'type']` is a global rule — it has no allowlist for "behavioural contracts". Once enabled, every `interface` in `src/` becomes a lint error. We therefore convert **all** exported `interface` declarations under `src/` (≈95 total across ~50 files). The mechanical mapping holds for every case — even classes that previously did `implements LlmProviderPort` keep working because TypeScript permits `class X implements <typeAlias>` when the alias resolves to an object/method shape.

Anything in `tests/`, `examples/`, `docs/`, `dist/`, or `node_modules/` is out of scope — the ESLint config already ignores those.

## File Structure

No new files. Edits only:

- `eslint.config.js` — add the new rule.
- ~50 files under `src/**/*.ts` — `interface X` → `type X = …`.
- `.changeset/<random>.md` — patch-level entry, narrating the augmentation-surface narrowing.

Authoritative inventory of `src/**` files containing `interface` (run `npm run lint` after step 1 to materialise the exact list — the lint failures will name every line):

```
src/agent/Agent.ts
src/agent/AgentFacade.ts
src/agent/AgentIdentity.ts
src/agent/AgentModule.ts
src/agent/createAgent.ts
src/agent/DecisionTrace.ts
src/agent/internal/agentDepsResolver.ts
src/agent/internal/buildAgentDeps.ts
src/animation/AnimationStateMachine.ts
src/animation/AnimationTransitionEvent.ts
src/body/Appearance.ts
src/body/Embodiment.ts
src/body/Transform.ts
src/cognition/adapters/js-son/JsSonReasoner.ts
src/cognition/adapters/mistreevous/MistreevousReasoner.ts
src/cognition/adapters/tfjs/TfjsLearner.ts
src/cognition/behavior/BehaviorRunner.ts
src/cognition/Intention.ts
src/cognition/IntentionCandidate.ts
src/cognition/learning/Learner.ts
src/cognition/reasoning/Reasoner.ts
src/cognition/reasoning/UrgencyReasoner.ts
src/events/DomainEvent.ts
src/events/EventBusPort.ts
src/events/standardEvents.ts
src/integrations/excalibur/ExcaliburAnimationBridge.ts
src/integrations/excalibur/types.ts
src/interaction/InteractionRequestedEvent.ts
src/lifecycle/AgeModel.ts
src/lifecycle/defineLifecycle.ts
src/lifecycle/LifeStageSchedule.ts
src/lifecycle/StageCapabilities.ts
src/memory/MemoryRecord.ts
src/memory/MemoryRepository.ts
src/modifiers/defineModifier.ts
src/modifiers/Modifier.ts
src/modifiers/ModifierEffect.ts
src/modifiers/Modifiers.ts
src/mood/Mood.ts
src/mood/MoodModel.ts
src/needs/ActiveNeedsPolicy.ts
src/needs/ExpressiveNeedsPolicy.ts
src/needs/Need.ts
src/needs/NeedsPolicy.ts
src/persistence/AgentSnapshot.ts
src/persistence/AgentState.ts
src/persistence/AutoSavePolicy.ts
src/persistence/FsSnapshotStore.ts
src/persistence/LocalStorageSnapshotStore.ts
src/persistence/offlineCatchUp.ts
src/persistence/SnapshotStorePort.ts
src/persistence/StoreBinding.ts
src/ports/ConsoleLogger.ts
src/ports/LlmProviderPort.ts
src/ports/Logger.ts
src/ports/MockLlmProvider.ts
src/ports/Rng.ts
src/randomEvents/defineRandomEvent.ts
src/randomEvents/RandomEventTicker.ts
src/skills/Skill.ts
src/skills/SkillContext.ts
src/species/SpeciesDescriptor.ts
```

(Anything new since this plan was written shows up as a fresh lint error after step 1 and joins the same sweep.)

## Conversion patterns

Memorise these three; they cover every case in `src/`.

**Plain object shape (most common).** Trailing `;` after the closing `}` is mandatory for `type` aliases.

```diff
-export interface LlmCacheHint {
-  readonly key: string;
-}
+export type LlmCacheHint = {
+  readonly key: string;
+};
```

**Method-bearing contract (a.k.a. behavioural interface).** Method shorthand stays valid inside a `type`. Classes that previously did `implements LlmProviderPort` keep working unchanged.

```diff
-export interface LlmProviderPort {
-  complete(messages: readonly LlmMessage[], options?: LlmCompleteOptions): Promise<LlmCompletion>;
-}
+export type LlmProviderPort = {
+  complete(messages: readonly LlmMessage[], options?: LlmCompleteOptions): Promise<LlmCompletion>;
+};
```

**Interface that extends another interface.** Convert with `&` intersection. Order doesn't matter for TS, but match source order for diff readability.

```diff
-export interface ModifierBlueprint extends ModifierTemplate {
-  readonly id: string;
-}
+export type ModifierBlueprint = ModifierTemplate & {
+  readonly id: string;
+};
```

**Generic interface.** Generics survive verbatim on the LHS.

```diff
-export interface TrainableReasoner<In, Out> {
-  train(pairs: Array<{ features: In; label: Out }>, opts?: TrainOptions): Promise<TrainResult>;
-}
+export type TrainableReasoner<In, Out> = {
+  train(pairs: Array<{ features: In; label: Out }>, opts?: TrainOptions): Promise<TrainResult>;
+};
```

**Important non-changes.** Do **not** touch:

- `interface` declarations inside `tests/`, `examples/`, `docs/`, `scripts/` — the ESLint test override already disables this rule pathway, but they're also out of contractual scope.
- Type-only re-exports (`export type { … } from …`) and `import type` lines — those are unaffected.
- The `.d.ts` files generated under `dist/` — `dist/` is `.gitignore`d and rebuilt on every `npm run build`.

---

## Chunk 1: Lock the invariant in via ESLint

### Task 1.1: Add the ESLint rule

**Files:**
- Modify: `eslint.config.js` (the main rules block, around line 130-140)

- [ ] **Step 1: Snapshot pre-rule lint output as the failing baseline**

Run: `npm run lint 2>&1 | tail -5`
Expected: passes (no errors). This is the "test was passing before" baseline; we're adding a stricter rule.

- [ ] **Step 2: Add the rule to `eslint.config.js`**

Open `eslint.config.js`. Locate the existing TS-style nudges block:

```ts
// Type-safety idioms.
'@typescript-eslint/prefer-nullish-coalescing': 'error',
'@typescript-eslint/prefer-optional-chain': 'error',
'@typescript-eslint/consistent-type-exports': 'error',
'@typescript-eslint/prefer-readonly': 'warn',
```

Add `consistent-type-definitions` immediately after `consistent-type-exports`:

```diff
 '@typescript-eslint/consistent-type-exports': 'error',
+// Closes a downstream-consumer footgun: `interface` enables TS declaration
+// merging, so a `.d.ts` augmentation can silently widen a library type.
+// `type` aliases cannot be merged. See review-bot finding 682b557.1.
+'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
 '@typescript-eslint/prefer-readonly': 'warn',
```

- [ ] **Step 3: Confirm lint now fails widely**

Run: `npm run lint 2>&1 | grep -c "consistent-type-definitions"`
Expected: a count ≥ 90 (one error per `interface` declaration in `src/`).

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js
git commit -m "lint: forbid \`interface\` (consistent-type-definitions)

Adds @typescript-eslint/consistent-type-definitions: ['error', 'type'] so
data-shape declarations stay non-mergeable. Repository invariant per
STYLE_GUIDE.md \"prefer type over interface\" — this rule turns the
preference into a hard gate. Subsequent commits convert every src/
interface to satisfy the rule. Refs #87 finding:682b557.1"
```

---

## Chunk 2: Convert `src/ports/`

The whole sweep is mechanical: open the file, edit, save, run a tight verify, commit. A single-directory commit keeps Codex review chunks small (5 files max each) without ballooning the PR's commit count.

### Task 2.1: `src/ports/`

**Files:**
- Modify: `src/ports/LlmProviderPort.ts` — `LlmCacheHint`, `LlmMessage`, `LlmBudget`, `LlmCompleteOptions`, `LlmUsage`, `LlmCompletion`, `LlmProviderPort` (7 total — bot listed 6, the 7th is the port contract itself which the global rule also flags).
- Modify: `src/ports/MockLlmProvider.ts` — `MockLlmScript`, `MockLlmProviderOptions`.
- Modify: `src/ports/Logger.ts` — `Logger`.
- Modify: `src/ports/Rng.ts` — `Rng`.
- Modify: `src/ports/ConsoleLogger.ts` — `ConsoleLoggerOptions`.

- [ ] **Step 1: Convert `LlmProviderPort.ts`**

Apply the plain-object pattern to `LlmCacheHint`, `LlmMessage`, `LlmBudget`, `LlmCompleteOptions`, `LlmUsage`, `LlmCompletion`. Apply the method-bearing pattern to `LlmProviderPort`.

- [ ] **Step 2: Convert `MockLlmProvider.ts`**

Apply the plain-object pattern to both. The `class MockLlmProvider implements LlmProviderPort` line stays unchanged — TS accepts a `type` alias on the right of `implements`.

- [ ] **Step 3: Convert `Logger.ts`, `Rng.ts`, `ConsoleLogger.ts`**

`Logger` and `Rng` use the method-bearing pattern; `ConsoleLoggerOptions` uses plain-object.

- [ ] **Step 4: Verify the directory is clean**

Run: `npx eslint src/ports --rule '{"@typescript-eslint/consistent-type-definitions":["error","type"]}'`
Expected: zero errors from `consistent-type-definitions` (other unrelated warnings, if any, are pre-existing and out of scope).

- [ ] **Step 5: Typecheck still green**

Run: `npm run typecheck`
Expected: clean exit. Failures here mean an `extends` chain was mishandled — go back and use the intersection pattern.

- [ ] **Step 6: Commit**

```bash
git add src/ports
git commit -m "refactor(ports): interface→type for LlmProvider, Logger, Rng

Mechanical conversion (no behaviour change). Closes the declaration-
merging footgun for LlmCacheHint, LlmMessage, LlmBudget,
LlmCompleteOptions, LlmUsage, LlmCompletion, LlmProviderPort,
MockLlmScript, MockLlmProviderOptions, Logger, Rng,
ConsoleLoggerOptions. Refs #87 finding:682b557.1"
```

---

## Chunk 3: Convert `src/agent/`

### Task 3.1: `src/agent/` (root + `internal/`)

**Files:**
- Modify: `src/agent/Agent.ts` — `AgentDependencies`.
- Modify: `src/agent/AgentFacade.ts` — `AgentFacade`.
- Modify: `src/agent/AgentIdentity.ts` — `AgentIdentity`.
- Modify: `src/agent/AgentModule.ts` — `ReactiveHandler`, `AgentModule`.
- Modify: `src/agent/createAgent.ts` — `CreateAgentConfig`.
- Modify: `src/agent/DecisionTrace.ts` — `DecisionTrace`.
- Modify: `src/agent/internal/agentDepsResolver.ts` — `ResolvedPorts`, `ResolvedSubsystems`, `ResolvedCognition`, `ResolvedPersistence`.
- Modify: `src/agent/internal/buildAgentDeps.ts` — `ResolvedDeps`.

- [ ] **Step 1: Convert all 8 files**

Plain-object pattern for every declaration (none of these `extends` anything).

- [ ] **Step 2: Verify**

Run: `npx eslint src/agent --rule '{"@typescript-eslint/consistent-type-definitions":["error","type"]}'`
Expected: zero `consistent-type-definitions` errors.

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/agent
git commit -m "refactor(agent): interface→type for Agent + createAgent + internal/

Mechanical conversion (no behaviour change). Covers AgentDependencies,
AgentFacade, AgentIdentity, ReactiveHandler, AgentModule,
CreateAgentConfig, DecisionTrace, and the four Resolved* types in
agentDepsResolver + ResolvedDeps in buildAgentDeps.
Refs #87 finding:682b557.1"
```

---

## Chunk 4: Convert `src/cognition/`

### Task 4.1: `src/cognition/` (core + adapters)

**Files:**
- Modify: `src/cognition/Intention.ts` — `Intention`.
- Modify: `src/cognition/IntentionCandidate.ts` — `IntentionCandidate`.
- Modify: `src/cognition/behavior/BehaviorRunner.ts` — `BehaviorRunner`.
- Modify: `src/cognition/learning/Learner.ts` — `LearningOutcome`, `Learner`.
- Modify: `src/cognition/reasoning/Reasoner.ts` — `ReasonerContext`, `Reasoner`.
- Modify: `src/cognition/reasoning/UrgencyReasoner.ts` — `UrgencyReasonerOptions`.
- Modify: `src/cognition/adapters/js-son/JsSonReasoner.ts` — `JsSonBeliefHelpers`, `JsSonReasonerOptions`.
- Modify: `src/cognition/adapters/mistreevous/MistreevousReasoner.ts` — `MistreevousHelpers`, `MistreevousReasonerOptions`.
- Modify: `src/cognition/adapters/tfjs/TfjsLearner.ts` — `TrainableReasoner<In, Out>`, `TfjsLearnerOptions<In, Out>`.

- [ ] **Step 1: Convert all 9 files**

Use the generic pattern for `TrainableReasoner` and `TfjsLearnerOptions`. Use the method-bearing pattern for `BehaviorRunner`, `Learner`, `Reasoner`. Plain-object for the rest.

- [ ] **Step 2: Verify**

Run: `npx eslint src/cognition --rule '{"@typescript-eslint/consistent-type-definitions":["error","type"]}'`
Expected: zero `consistent-type-definitions` errors.

Run: `npm run typecheck`
Expected: clean. (Adapters are peer-optional but their TS surface still typechecks.)

- [ ] **Step 3: Commit**

```bash
git add src/cognition
git commit -m "refactor(cognition): interface→type across core + adapters

Mechanical conversion (no behaviour change). Covers Intention,
IntentionCandidate, BehaviorRunner, Learner + LearningOutcome, Reasoner +
ReasonerContext, UrgencyReasonerOptions, the js-son adapter pair, the
mistreevous adapter pair, and the tfjs TrainableReasoner +
TfjsLearnerOptions generic pair. Refs #87 finding:682b557.1"
```

---

## Chunk 5: Convert `src/persistence/`

### Task 5.1: `src/persistence/`

**Files:**
- Modify: `src/persistence/AgentSnapshot.ts` — `AgentSnapshot`.
- Modify: `src/persistence/AgentState.ts` — `AgentState`.
- Modify: `src/persistence/AutoSavePolicy.ts` — `AutoSavePolicy`.
- Modify: `src/persistence/FsSnapshotStore.ts` — `FsAdapter`, `FsSnapshotStoreOptions`.
- Modify: `src/persistence/LocalStorageSnapshotStore.ts` — `StorageLike`, `LocalStorageSnapshotStoreOptions`.
- Modify: `src/persistence/offlineCatchUp.ts` — `CatchUpOptions`, `CatchUpResult`.
- Modify: `src/persistence/SnapshotStorePort.ts` — `SnapshotStorePort`.
- Modify: `src/persistence/StoreBinding.ts` — `BindOptions`.

- [ ] **Step 1: Convert all 8 files**

Method-bearing pattern for `FsAdapter`, `StorageLike`, `SnapshotStorePort`. Plain-object for the rest.

- [ ] **Step 2: Verify**

Run: `npx eslint src/persistence --rule '{"@typescript-eslint/consistent-type-definitions":["error","type"]}'`
Expected: zero errors.

Run: `npm run typecheck`
Expected: clean. The snapshot version invariant (CLAUDE.md §Common pitfalls) is unaffected — only the declaration kind changes.

- [ ] **Step 3: Commit**

```bash
git add src/persistence
git commit -m "refactor(persistence): interface→type for snapshot + store ports

Mechanical conversion (no behaviour change). Covers AgentSnapshot,
AgentState, AutoSavePolicy, FsAdapter + FsSnapshotStoreOptions,
StorageLike + LocalStorageSnapshotStoreOptions, CatchUpOptions +
CatchUpResult, SnapshotStorePort, BindOptions.
Refs #87 finding:682b557.1"
```

---

## Chunk 6: Convert `src/needs/`, `src/modifiers/`, `src/mood/`, `src/lifecycle/`

These four directories all hold small interface clusters (1-4 each) that fit in a single commit comfortably.

### Task 6.1: All four directories in one sweep

**Files:**
- Modify: `src/needs/Need.ts` — `Need`, `NeedsDelta`.
- Modify: `src/needs/NeedsPolicy.ts` — `NeedsPolicy`.
- Modify: `src/needs/ActiveNeedsPolicy.ts` — `ActiveNeedsPolicyOptions`.
- Modify: `src/needs/ExpressiveNeedsPolicy.ts` — `ExpressiveNeedsPolicyOptions`.
- Modify: `src/modifiers/Modifier.ts` — `Modifier`.
- Modify: `src/modifiers/ModifierEffect.ts` — `ModifierEffect`.
- Modify: `src/modifiers/Modifiers.ts` — `ModifierRemoval`.
- Modify: `src/modifiers/defineModifier.ts` — `ModifierTemplate`, `ModifierBlueprint extends ModifierTemplate` (use the intersection pattern).
- Modify: `src/mood/Mood.ts` — `Mood`.
- Modify: `src/mood/MoodModel.ts` — `MoodEvaluationContext`, `MoodModel`.
- Modify: `src/lifecycle/AgeModel.ts` — `LifeStageTransition`, `AgeModelOptions`.
- Modify: `src/lifecycle/defineLifecycle.ts` — `LifecycleTemplate`, `LifecycleDescriptor`.
- Modify: `src/lifecycle/LifeStageSchedule.ts` — `LifeStageScheduleEntry`.
- Modify: `src/lifecycle/StageCapabilities.ts` — `StageCapabilityRule`.

- [ ] **Step 1: Convert all 14 files**

Watch for the one `extends` case: `ModifierBlueprint extends ModifierTemplate`. Use intersection pattern. Method-bearing pattern for `NeedsPolicy`, `MoodModel`. Plain-object for the rest.

- [ ] **Step 2: Verify**

Run: `npx eslint src/needs src/modifiers src/mood src/lifecycle --rule '{"@typescript-eslint/consistent-type-definitions":["error","type"]}'`
Expected: zero errors.

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/needs src/modifiers src/mood src/lifecycle
git commit -m "refactor: interface→type for needs, modifiers, mood, lifecycle

Mechanical conversion (no behaviour change). ModifierBlueprint converts
its \`extends ModifierTemplate\` to an intersection. Refs #87 finding:682b557.1"
```

---

## Chunk 7: Convert `src/events/`, `src/randomEvents/`, `src/skills/`, `src/memory/`, `src/animation/`, `src/body/`, `src/interaction/`, `src/species/`, `src/integrations/excalibur/`

The remaining tail. The single biggest cluster is `src/events/standardEvents.ts` (~10 event interfaces, all `extends DomainEvent`).

### Task 7.1: All remaining directories

**Files:**
- Modify: `src/events/DomainEvent.ts` — `DomainEvent`.
- Modify: `src/events/EventBusPort.ts` — `EventBusPort`.
- Modify: `src/events/standardEvents.ts` — `NeedCriticalEvent`, `NeedSafeEvent`, `NeedSatisfiedEvent`, `ModifierAppliedEvent`, `ModifierExpiredEvent`, `ModifierRemovedEvent`, `LifeStageChangedEvent`, `AgentDiedEvent`, `SkillCompletedEvent`, `SkillFailedEvent`, `MoodChangedEvent`, `AgentTickedEvent`. Every one of these is `extends DomainEvent` — use intersection pattern uniformly: `type X = DomainEvent & { … };`.
- Modify: `src/randomEvents/defineRandomEvent.ts` — `RandomEventContext`, `RandomEventDef`.
- Modify: `src/randomEvents/RandomEventTicker.ts` — `RandomEventTickOptions`.
- Modify: `src/skills/Skill.ts` — `Skill<Params>` (generic), `SkillOutcome`, `SkillError`.
- Modify: `src/skills/SkillContext.ts` — `SkillContext`.
- Modify: `src/memory/MemoryRecord.ts` — `MemoryRecord`.
- Modify: `src/memory/MemoryRepository.ts` — `MemoryFilter`, `MemoryRepository` (method-bearing).
- Modify: `src/animation/AnimationStateMachine.ts` — `AnimationTransition`, `ReconcileContext`, `AnimationStateMachineOptions`.
- Modify: `src/animation/AnimationTransitionEvent.ts` — `AnimationTransitionEvent extends DomainEvent` (intersection).
- Modify: `src/body/Appearance.ts` — `Appearance`.
- Modify: `src/body/Embodiment.ts` — `Embodiment`.
- Modify: `src/body/Transform.ts` — `Vector3Like`, `Transform`.
- Modify: `src/interaction/InteractionRequestedEvent.ts` — `InteractionRequestedEvent extends DomainEvent` (intersection).
- Modify: `src/species/SpeciesDescriptor.ts` — `SpeciesDescriptor`.
- Modify: `src/integrations/excalibur/ExcaliburAnimationBridge.ts` — `ExcaliburAnimationBridgeOptions`.
- Modify: `src/integrations/excalibur/types.ts` — `Vector2Like`, `ActorLike`, `InputSourceLike`.

- [ ] **Step 1: Convert all files in this tail**

The big one is `standardEvents.ts` — every event is `extends DomainEvent`. Repeat the intersection pattern:

```diff
-export interface NeedCriticalEvent extends DomainEvent {
-  readonly type: 'agent.need.critical';
-  …
-}
+export type NeedCriticalEvent = DomainEvent & {
+  readonly type: 'agent.need.critical';
+  …
+};
```

- [ ] **Step 2: Verify the whole tail**

Run: `npx eslint src --rule '{"@typescript-eslint/consistent-type-definitions":["error","type"]}'`
Expected: **zero** `consistent-type-definitions` errors anywhere in `src/`. This is the post-condition for the entire sweep.

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/events src/randomEvents src/skills src/memory src/animation src/body src/interaction src/species src/integrations
git commit -m "refactor: interface→type for events, skills, memory, body, integrations

Mechanical conversion (no behaviour change). Every event-shape interface
that extended DomainEvent becomes a DomainEvent intersection.
Refs #87 finding:682b557.1"
```

---

## Chunk 8: Final gate + changeset

### Task 8.1: Full verify

- [ ] **Step 1: Format**

Run: `npm run format`
Expected: prettier may rewrap a handful of multi-line types (cosmetic). Re-stage if anything changes.

If `git status` shows changes after format:

```bash
git add -A
git commit -m "style: prettier post-sweep"
```

- [ ] **Step 2: Full verify gate**

Run: `npm run verify`
Expected: green across `format:check`, `lint`, `typecheck`, `test`, `build`. This is the pre-PR gate per CLAUDE.md.

If anything fails, stop and diagnose — do **not** push a red branch.

### Task 8.2: Changeset

Per CLAUDE.md, "PRs that change library behavior need a changeset". This refactor narrows the augmentation surface — a downstream consumer who was doing `declare module 'agentonomous'` interface merging will find their merges silently dropped (the new `type` aliases are not mergeable). That qualifies as a behaviour change for declaration-merging consumers, even though no runtime path changes.

- [ ] **Step 1: Generate the changeset**

Run: `npm run changeset`

Pick **patch** (no API surface removed; only the declaration kind changed).

Summary text:

> Convert all `src/` interfaces to `type` aliases. Closes a downstream-consumer footgun where TypeScript declaration merging could silently widen library contracts. Source-level consumers see no change; consumers relying on `declare module 'agentonomous'` augmentation of these symbols will need to wrap with their own type aliases instead.

- [ ] **Step 2: Commit the changeset**

```bash
git add .changeset/
git commit -m "chore: changeset for interface→type sweep"
```

### Task 8.3: Push + open PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin fix/review-bot-blocker-llmproviderport-interface-to-type
```

- [ ] **Step 2: Open the PR via `gh pr create`**

Body MUST contain on its own line:

```
Refs #87 finding:682b557.1
```

Body MUST NOT contain `Closes #87` / `Fixes #87` (would close the long-lived tracker).

Suggested PR body (paste via heredoc when running `gh pr create`):

```markdown
## Summary
- Mechanical sweep: every `interface` in `src/` becomes a `type` alias.
- Adds ESLint rule `@typescript-eslint/consistent-type-definitions: ['error', 'type']` so this stays enforced.
- Closes a declaration-merging footgun where downstream `.d.ts` augmentation could silently widen library contracts.

## Test plan
- [x] `npm run verify` green locally
- [x] `npx eslint src --rule '{"@typescript-eslint/consistent-type-definitions":["error","type"]}'` reports zero errors
- [x] No runtime behaviour changes (refactor only)

Refs #87 finding:682b557.1
```

---

## Acceptance (recap)

- ESLint rule `@typescript-eslint/consistent-type-definitions: ['error', 'type']` is in place.
- Zero `interface` declarations remain in `src/` (verified by lint + grep `^export interface\|^interface ` returning empty under `src/`).
- `npm run verify` is green.
- PR open against `develop` with magic line `Refs #87 finding:682b557.1` in the body.
- Codex review on the PR is acknowledged or rebutted on each thread before merge.

## Rollout

- Branch: `fix/review-bot-blocker-llmproviderport-interface-to-type` (already cut by review-fix skill).
- PR base: `develop`.
- PR body MUST contain on its own line: `Refs #87 finding:682b557.1`.
- PR body MUST NOT contain `Closes #87` / `Fixes #87` — the `review-fix-shipped` Action edits the tracker post-merge.
- Changeset: patch (see Task 8.2).
- Post-merge cleanup (per CLAUDE.md): `git switch develop && git pull origin develop && git branch -d fix/review-bot-blocker-llmproviderport-interface-to-type && git worktree remove .worktrees/fix-review-blocker-llmproviderport-interface-to-type`.

---

## Outcome (post-execution)

Shipped on PR #103. Final scope was wider than originally enumerated — the ESLint rule is binary and flagged every `interface` declaration in the repo, not just the bot-listed 16:

| Chunk | Commit | Files | Declarations | Notes |
|---|---|---|---|---|
| 1 | `b100b66` | 1 | 0 (rule add) | 124 violations baselined. |
| 2 | `b4bf7b4` | 7 | 14 | Scope-corrected: `Validator.ts` + `WallClock.ts` added (plan listed 5 files). |
| 3 | `45bdfa4` | 14 | 20 | Scope-corrected: `Persona`, `RemoteController`, `ScriptedController`, `types.ts`, `internal/TickContext.ts`, `internal/tickHelpers.ts` added (plan listed 8). |
| 4 | `09a0a1f` | 11 | 17 | Scope-corrected: `DirectBehaviorRunner.ts` + ambient `js-son-agent.d.ts` added. |
| 5 | `1bb52ce` | 8 | 11 | Plan-exact (no scope expansion). |
| 6 | `ba49bd7` | 14 | 19 | Plan-exact. `ModifierBlueprint extends ModifierTemplate` → intersection. |
| 7 | `d30c86a` | 22 | 41 | Scope-corrected: 4 test files added (`tests/examples/*`, `tests/integration/nurture-pet-deterministic.test.ts`, `tests/unit/events/fxHint.test.ts`) — ESLint test-override block does NOT disable `consistent-type-definitions`, so leaving them would have left lint red. 14 `extends DomainEvent` → intersection conversions. |
| 8 | `641c3f0` | 1 | 0 | Patch changeset. |

**Final state:** zero `interface` declarations remain anywhere in `src/`. Whole-repo `npm run lint` is green (2 pre-existing complexity warnings in `CognitionPipeline.ts`, unrelated). `npm run verify` is green (500/500 tests, build OK).

**Excluded from sweep (correctly):** `examples/nurture-pet/src/*.ts` — `eslint.config.js` ignores `examples` at the top level, so the rule never fires there. Six `interface` declarations remain in `examples/` and are intentional.

**Minor cosmetic items deferred (not blocking):**
- 3 JSDoc lines in `src/agent/AgentModule.ts` and `src/agent/AgentFacade.ts` use the word "interface" as prose (not as a TS keyword). Left unchanged — too risky to edit prose during a refactor PR.
- Missing blank line before the comment block in `eslint.config.js` (cosmetic, format pass did not touch it).
