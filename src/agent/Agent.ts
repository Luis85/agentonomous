import type { DomainEvent } from '../events/DomainEvent.js';
import type { EventBusPort } from '../events/EventBusPort.js';
import {
  AGENT_DIED,
  AGENT_TICKED,
  LIFE_STAGE_CHANGED,
  MODIFIER_APPLIED,
  MODIFIER_EXPIRED,
  MODIFIER_REMOVED,
  type AgentDiedEvent,
  type AgentTickedEvent,
  type LifeStageChangedEvent,
  type ModifierAppliedEvent,
  type ModifierRemovedEvent,
} from '../events/standardEvents.js';
import {
  ANIMATION_TRANSITION,
  type AnimationTransitionEvent,
} from '../animation/AnimationTransitionEvent.js';
import {
  AnimationStateMachine,
  type AnimationStateMachineOptions,
} from '../animation/AnimationStateMachine.js';
import type { Embodiment } from '../body/Embodiment.js';
import type { BehaviorRunner } from '../cognition/behavior/BehaviorRunner.js';
import { DirectBehaviorRunner } from '../cognition/behavior/DirectBehaviorRunner.js';
import type { Learner } from '../cognition/learning/Learner.js';
import { NoopLearner } from '../cognition/learning/NoopLearner.js';
import type { Reasoner } from '../cognition/reasoning/Reasoner.js';
import { UrgencyReasoner } from '../cognition/reasoning/UrgencyReasoner.js';
import type { NeedsPolicy } from '../needs/NeedsPolicy.js';
import type { AgeModel } from '../lifecycle/AgeModel.js';
import { DECEASED_STAGE, type LifeStage } from '../lifecycle/LifeStage.js';
import type { StageCapabilityMap } from '../lifecycle/StageCapabilities.js';
import type { MemoryRepository } from '../memory/MemoryRepository.js';
import type { Modifier } from '../modifiers/Modifier.js';
import { Modifiers } from '../modifiers/Modifiers.js';
import type { Mood } from '../mood/Mood.js';
import type { MoodModel } from '../mood/MoodModel.js';
import type { Needs } from '../needs/Needs.js';
import type { AgentSnapshot, SnapshotPart } from '../persistence/AgentSnapshot.js';
import { CURRENT_SNAPSHOT_VERSION } from '../persistence/AgentSnapshot.js';
import {
  AutoSaveTracker,
  DEFAULT_AUTOSAVE_POLICY,
  type AutoSavePolicy,
} from '../persistence/AutoSavePolicy.js';
import { runCatchUp } from '../persistence/offlineCatchUp.js';
import type { SnapshotStorePort } from '../persistence/SnapshotStorePort.js';
import type { RandomEventTicker } from '../randomEvents/RandomEventTicker.js';
import { InMemoryMemoryAdapter } from '../memory/InMemoryMemoryAdapter.js';
import { SkillRegistry } from '../skills/SkillRegistry.js';
import type { RemoteController } from './RemoteController.js';
import type { ScriptedController } from './ScriptedController.js';
import type { Rng } from '../ports/Rng.js';
import type { WallClock } from '../ports/WallClock.js';
import type { Logger } from '../ports/Logger.js';
import { NullLogger } from '../ports/Logger.js';
import type { Validator } from '../ports/Validator.js';
import type { AgentState } from '../persistence/AgentState.js';
import { INTERACTION_REQUESTED } from '../interaction/InteractionRequestedEvent.js';
import type { AgentFacade } from './AgentFacade.js';
import type { AgentIdentity } from './AgentIdentity.js';
import type { AgentModule, ReactiveHandler } from './AgentModule.js';
import { isInvokeSkillAction } from './AgentAction.js';
import type { ControlMode } from './ControlMode.js';
import type { DecisionTrace } from './DecisionTrace.js';
import { InvalidTimeScaleError, MissingDependencyError } from './errors.js';
import { LifecycleTicker } from './internal/LifecycleTicker.js';
import { ModifiersTicker } from './internal/ModifiersTicker.js';
import { NeedsTicker } from './internal/NeedsTicker.js';
import { MoodReconciler } from './internal/MoodReconciler.js';
import { AnimationReconciler } from './internal/AnimationReconciler.js';
import { CognitionPipeline } from './internal/CognitionPipeline.js';

const DEFAULT_TIME_SCALE = 1;

/**
 * Dependencies required to construct an `Agent` directly.
 *
 * `createAgent(config)` fills in sensible defaults; reach for this type
 * only if you want full control over every slot.
 *
 * Optional subsystems land in later milestones; their fields are added
 * here incrementally.
 */
export interface AgentDependencies {
  identity: AgentIdentity;
  eventBus: EventBusPort;
  clock: WallClock;
  rng: Rng;
  logger?: Logger;
  validator?: Validator;
  /** Multiplier applied to `dtSeconds` to produce `virtualDt`. Default: 1. */
  timeScale?: number;
  /** Plugins installed at construction time. Phase A: config-time only. */
  modules?: readonly AgentModule[];
  /** Initial control mode. Default: `'autonomous'`. M6 wires scripted/remote. */
  controlMode?: ControlMode;
  /** Optional homeostatic needs (hunger, energy, …). Wired in M3. */
  needs?: Needs;
  /**
   * Optional modifier (buff/debuff) collection. If omitted but needed, the
   * agent constructs an empty `Modifiers` instance internally.
   */
  modifiers?: Modifiers;
  /** Lifecycle / aging model. Without it, agents never age or transition stages. */
  ageModel?: AgeModel;
  /** Optional per-stage skill capability gates. Consulted by the behavior runner (M7). */
  stageCapabilities?: StageCapabilityMap;
  /** Optional mood model. `DefaultMoodModel` in createAgent when needs are present. */
  moodModel?: MoodModel;
  /** Optional embodiment (transform + appearance + locomotion). M9. */
  embodiment?: Embodiment;
  /** Optional random event ticker. M11. */
  randomEvents?: RandomEventTicker;
  /** Optional memory store. M10. */
  memory?: MemoryRepository;
  /** Remote controller for `controlMode: 'remote'`. M6. */
  remote?: RemoteController;
  /** Scripted controller for `controlMode: 'scripted'`. M6. */
  scripted?: ScriptedController;
  /** Snapshot store used by auto-save. M10. */
  snapshotStore?: SnapshotStorePort;
  /** Auto-save policy. Defaults to `DEFAULT_AUTOSAVE_POLICY` when a store is wired. */
  autoSave?: AutoSavePolicy;
  /** Key used when auto-saving snapshots. Defaults to the agent id. */
  autoSaveKey?: string;
  /** Reasoner. Defaults to `UrgencyReasoner`. M7. */
  reasoner?: Reasoner;
  /** Behavior runner. Defaults to `DirectBehaviorRunner`. M7. */
  behavior?: BehaviorRunner;
  /** Learner for future-tick scoring. Defaults to `NoopLearner`. M7. */
  learner?: Learner;
  /** Skill registry. Defaults to an empty registry. M7. */
  skills?: SkillRegistry;
  /**
   * Needs policy consulted each tick for candidates. When both this and
   * `needs` are set, the agent feeds needs-driven candidates into the
   * reasoner. M7.
   */
  needsPolicy?: NeedsPolicy;
  /** Animation state machine. Defaults to a new instance with sensible maps. M8. */
  animation?: AnimationStateMachine | AnimationStateMachineOptions;
}

/**
 * The Agent orchestrator. In M2 it provides the lifecycle skeleton, event
 * bus integration, reactive handler dispatch, `interact()` sugar, snapshot-
 * ready state projection, and a deterministic tick pipeline.
 *
 * Later milestones fill in cognition, needs, lifecycle, mood, modifiers,
 * body, animation, and persistence — the tick pipeline here intentionally
 * names each future step with a `// Stage N:` comment so the growth path
 * is visible at a glance.
 */
export class Agent {
  readonly identity: AgentIdentity;
  readonly clock: WallClock;
  readonly rng: Rng;
  readonly logger: Logger;
  readonly eventBus: EventBusPort;
  readonly validator: Validator | undefined;
  readonly needs: Needs | undefined;
  readonly modifiers: Modifiers;
  readonly ageModel: AgeModel | undefined;
  readonly stageCapabilities: StageCapabilityMap | undefined;
  readonly moodModel: MoodModel | undefined;
  readonly embodiment: Embodiment | undefined;
  readonly randomEvents: RandomEventTicker | undefined;
  readonly memory: MemoryRepository | undefined;
  readonly remote: RemoteController | undefined;
  readonly scripted: ScriptedController | undefined;
  readonly snapshotStore: SnapshotStorePort | undefined;
  readonly autoSaveKey: string;
  /**
   * Current cognition reasoner. Mutable: consumers live-swap via
   * `setReasoner(reasoner)`. The tick pipeline reads this field fresh
   * each tick rather than capturing it at construction.
   */
  reasoner: Reasoner;
  readonly behavior: BehaviorRunner;
  readonly learner: Learner;
  readonly skills: SkillRegistry;
  readonly needsPolicy: NeedsPolicy | undefined;
  readonly animation: AnimationStateMachine;
  /**
   * Id of the skill whose execution is currently driving the animation
   * (if any). Public for access by internal tick helpers under
   * `src/agent/internal/`; consumers should not reach for it directly.
   */
  currentActiveSkillId: string | undefined;
  protected readonly autoSaveTracker: AutoSaveTracker | undefined;
  /** Latest `Mood` evaluation — see `currentActiveSkillId` for the visibility rationale. */
  currentMood: Mood | undefined;
  /** Cumulative virtual seconds tracked for random-event cooldown bookkeeping. */
  protected virtualNowSeconds = 0;

  protected timeScale: number;
  /** Current control mode — `autonomous` / `scripted` / `remote`. Mutable to support switching mid-run. */
  controlMode: ControlMode;
  /** `true` once the agent has died — ticks become no-ops. Public for helper access. */
  halted = false;
  protected readonly reactiveHandlers: ReactiveHandler[] = [];
  protected readonly modules: AgentModule[] = [];
  /** Events queued for inclusion in the current tick's `emitted` field. */
  protected emittedThisTick: DomainEvent[] = [];
  /** 1-indexed count of `AgentTicked` events emitted. Resets only on reconstruction. */
  protected ticksEmitted: number = 0;

  // =========================================================================
  // Internal tick helpers (extracted under src/agent/internal/).
  // =========================================================================
  private readonly lifecycleTicker: LifecycleTicker;
  private readonly modifiersTicker: ModifiersTicker;
  private readonly needsTicker: NeedsTicker;
  private readonly moodReconciler: MoodReconciler;
  private readonly animationReconciler: AnimationReconciler;
  private readonly cognitionPipeline: CognitionPipeline;

  constructor(deps: AgentDependencies) {
    if (!deps.identity) throw new MissingDependencyError('identity');
    if (!deps.eventBus) throw new MissingDependencyError('eventBus');
    if (!deps.clock) throw new MissingDependencyError('clock');
    if (!deps.rng) throw new MissingDependencyError('rng');

    this.identity = deps.identity;
    this.eventBus = deps.eventBus;
    this.clock = deps.clock;
    this.rng = deps.rng;
    this.logger = deps.logger ?? new NullLogger();
    this.validator = deps.validator;
    this.timeScale = deps.timeScale ?? DEFAULT_TIME_SCALE;
    this.controlMode = deps.controlMode ?? 'autonomous';
    this.needs = deps.needs;
    this.modifiers = deps.modifiers ?? new Modifiers();
    this.ageModel = deps.ageModel;
    this.stageCapabilities = deps.stageCapabilities;
    this.moodModel = deps.moodModel;
    this.embodiment = deps.embodiment;
    this.randomEvents = deps.randomEvents;
    this.memory = deps.memory;
    this.remote = deps.remote;
    this.scripted = deps.scripted;
    this.snapshotStore = deps.snapshotStore;
    this.autoSaveKey = deps.autoSaveKey ?? this.identity.id;
    this.autoSaveTracker =
      this.snapshotStore !== undefined
        ? new AutoSaveTracker(deps.autoSave ?? DEFAULT_AUTOSAVE_POLICY)
        : undefined;
    this.reasoner = deps.reasoner ?? new UrgencyReasoner();
    this.behavior = deps.behavior ?? new DirectBehaviorRunner();
    this.learner = deps.learner ?? new NoopLearner();
    this.skills = deps.skills ?? new SkillRegistry();
    this.needsPolicy = deps.needsPolicy;
    this.animation =
      deps.animation instanceof AnimationStateMachine
        ? deps.animation
        : new AnimationStateMachine(deps.animation);
    this.virtualNowSeconds = this.ageModel?.ageSeconds ?? 0;
    if (this.ageModel?.stage === DECEASED_STAGE) {
      this.halted = true;
    }

    // Wire up the tick-pipeline helpers. They keep a reference back to the
    // agent and read/mutate state through the (now-public) field surface.
    this.lifecycleTicker = new LifecycleTicker(this);
    this.modifiersTicker = new ModifiersTicker(this);
    this.needsTicker = new NeedsTicker(this);
    this.moodReconciler = new MoodReconciler(this);
    this.animationReconciler = new AnimationReconciler(this);
    this.cognitionPipeline = new CognitionPipeline(this);

    // Install config-time modules.
    for (const mod of deps.modules ?? []) {
      this.installModule(mod);
    }
  }

  // =========================================================================
  // Internal protocol (exposed for helper classes under src/agent/internal/).
  // Marked @internal — not re-exported from the public barrel; consumers go
  // through `AgentFacade` / `createAgent` instead.
  // =========================================================================

  /** @internal Publish an event onto the bus and into the tick's emitted list. */
  publishEvent(event: DomainEvent): void {
    this.publish(event);
  }

  /** @internal Route the death path — used by `NeedsTicker` when health hits 0. */
  routeDeath(
    cause: 'health-depleted' | 'stage-transition' | 'explicit' | (string & {}),
    reason: string | undefined,
    at: number,
  ): void {
    this.die(cause, reason, at);
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Advance the agent by `dtSeconds` of wall time. Returns a `DecisionTrace`
   * describing what happened. Callers typically drive this from a host loop
   * (Excalibur onPreUpdate, sim-ecs system, or a manual `while`).
   *
   * See the plan's tick cycle section; steps beyond M2 land as subsequent
   * milestones extend this method.
   */
  async tick(dtSeconds: number): Promise<DecisionTrace> {
    const tickStartedAt = this.clock.now();
    // Snapshot timeScale once at tick entry so a mid-tick setTimeScale()
    // from a reactive handler (Stage 1) takes effect on the NEXT tick,
    // as documented on `setTimeScale()`. Both `virtualDtSeconds` and the
    // Stage 2/2.7/2.8 pause gate read from this local.
    const tickTimeScale = this.timeScale;
    const virtualDtSeconds = Math.max(0, dtSeconds) * tickTimeScale;

    // Stage -1: halted short-circuit.
    if (this.halted) {
      return {
        agentId: this.identity.id,
        tickStartedAt,
        virtualDtSeconds,
        controlMode: this.controlMode,
        stage: DECEASED_STAGE,
        halted: true,
        perceived: [],
        actions: [],
        emitted: [],
      };
    }

    this.emittedThisTick = [];

    // Stage 0: advance age + life stages (catch-up-aware).
    const stageTransitions = this.lifecycleTicker.run(virtualDtSeconds, tickStartedAt);

    // Stage 1: perceive — drain pending events from the bus.
    // `AgentTicked` is a meta-event emitted at the end of each completed tick;
    // it must not re-enter the cognition pipeline as a perceived stimulus.
    const perceived = this.eventBus.drain().filter((e) => e.type !== AGENT_TICKED);
    await this.dispatchReactiveHandlers(perceived);

    // Stage 1.5: random events — publish seeded random events onto the bus.
    this.virtualNowSeconds += virtualDtSeconds;
    this.runRandomEventsTick(virtualDtSeconds, tickStartedAt);

    // Pause short-circuit: `setTimeScale(0)` freezes not just virtual-time
    // progress but also the three wall-clock-driven reconciliation stages
    // (modifier expiry, mood, animation), so consumers see a consistently
    // frozen agent while paused. Deferred expiries fire on the first
    // post-resume tick — see `docs/plans/2026-04-19-pause-semantics.md` (Option A).
    // Read from the tick-entry snapshot so a reactive handler that called
    // `setTimeScale(0)` during Stage 1 doesn't flip the gate mid-tick.
    const paused = tickTimeScale === 0;

    // Stage 2: modifier tick — expire time-bound modifiers. Skipped at
    // scale 0; `expiresAt` is still absolute wall-clock ms, so any
    // modifier whose window elapses during the pause is detected here
    // on the first post-resume tick.
    const expired = paused ? [] : this.modifiersTicker.run(tickStartedAt);

    // Stage 2.5: needs tick. Decay (scaled by modifier multipliers), critical crossings → events.
    // If health just hit 0 during decay we die here and short-circuit.
    const needsDeltas = this.needsTicker.run(virtualDtSeconds, tickStartedAt);
    if (this.halted) {
      return {
        agentId: this.identity.id,
        tickStartedAt,
        virtualDtSeconds,
        controlMode: this.controlMode,
        stage: DECEASED_STAGE,
        halted: true,
        perceived,
        actions: [],
        emitted: [...this.emittedThisTick],
      };
    }

    // Stage 2.7: mood evaluate. Skipped at scale 0.
    const moodChange = paused ? null : this.moodReconciler.run(tickStartedAt);
    // Stage 2.8: animation reconcile. Skipped at scale 0.
    const animationTransition = paused ? null : this.animationReconciler.run(tickStartedAt);

    // Stages 3–7: cognition pipeline. `collectActions` dispatches by
    // control mode (autonomous → reasoner + behavior runner, else
    // remote/scripted). `executeActions` then runs invoke-skill /
    // emit-event / noop actions through the registry, emits
    // SkillCompleted | SkillFailed, and lets the learner score outcomes.
    const { actions, candidates } = await this.cognitionPipeline.collectActions(
      tickStartedAt,
      perceived,
    );
    await this.cognitionPipeline.executeActions(actions, tickStartedAt);

    // Stage 9: persist + autosave. Skip advance at pause — paused
    // ticks shouldn't count toward `everyTicks` (would otherwise churn
    // the snapshot store at 60fps while `setTimeScale(0)` freezes
    // every other stage). Event-triggered saves still fire via
    // observeEvent() in publish(), so a critical event during pause
    // still persists.
    if (this.autoSaveTracker && !paused) {
      this.autoSaveTracker.advance(virtualDtSeconds);
    }

    // Stage 10: return trace.
    const deltasRecord: Record<string, unknown> = {};
    if (needsDeltas.length > 0) deltasRecord.needs = needsDeltas;
    if (expired.length > 0) deltasRecord.modifiersExpired = expired.map((r) => r.modifier.id);
    const activeModifierIds = this.modifiers.list().map((m) => m.id);
    if (activeModifierIds.length > 0) deltasRecord.activeModifiers = activeModifierIds;
    if (stageTransitions.length > 0) {
      deltasRecord.stageTransitions = stageTransitions;
    }
    if (moodChange) deltasRecord.mood = moodChange;
    if (animationTransition) deltasRecord.animation = animationTransition;
    if (candidates.length > 0) deltasRecord.candidates = candidates;
    const deltas = Object.keys(deltasRecord).length > 0 ? deltasRecord : undefined;

    const stage: LifeStage = this.ageModel?.stage ?? 'alive';
    const trace: DecisionTrace = {
      agentId: this.identity.id,
      tickStartedAt,
      virtualDtSeconds,
      controlMode: this.controlMode,
      stage,
      halted: false,
      perceived,
      actions,
      emitted: [...this.emittedThisTick],
      ...(deltas ? { deltas } : {}),
    };

    // Emit AgentTicked as the final act of a completed tick. Placed
    // AFTER trace assembly (with its snapshot-copied `emitted`) so the
    // meta-event does not appear in its own trace.emitted. Publish
    // flows through `this.publish(...)` so subscribers receive it via
    // `agent.subscribe` like any other event.
    this.ticksEmitted += 1;
    const firstAction = actions[0];
    const selectedAction =
      firstAction === undefined
        ? null
        : isInvokeSkillAction(firstAction)
          ? { type: firstAction.type, skillId: firstAction.skillId }
          : { type: firstAction.type };
    this.publish({
      type: AGENT_TICKED,
      at: tickStartedAt,
      agentId: this.identity.id,
      tickNumber: this.ticksEmitted,
      virtualDtSeconds,
      wallDtSeconds: Math.max(0, dtSeconds),
      selectedAction,
      trace,
    } satisfies AgentTickedEvent);

    await this.maybeAutoSave();
    return trace;
  }

  /** Publish random events onto the bus (step 1.5). */
  protected runRandomEventsTick(virtualDtSeconds: number, at: number): void {
    if (!this.randomEvents || virtualDtSeconds <= 0) return;
    const events = this.randomEvents.tick({
      virtualDtSeconds,
      virtualNowSeconds: this.virtualNowSeconds,
      rng: this.rng,
      needs: this.needs,
      modifiers: this.modifiers,
      stage: this.ageModel?.stage,
    });
    for (const event of events) {
      // Ensure `at` is populated even if the emitter forgot.
      this.publish({ ...event, at: event.at ?? at });
    }
  }

  /** Persist the current snapshot to the configured store if the policy fires. */
  protected async maybeAutoSave(): Promise<void> {
    if (!this.autoSaveTracker || !this.snapshotStore) return;
    if (!this.autoSaveTracker.shouldSave()) return;
    await this.snapshotStore.save(this.autoSaveKey, this.snapshot());
    this.autoSaveTracker.markSaved();
  }

  /**
   * Internal death path. Marks the agent deceased, flips `halted`, and emits
   * `AgentDied`. Used by both explicit `agent.kill(reason)` and automatic
   * health-depletion.
   */
  protected die(
    cause: 'health-depleted' | 'stage-transition' | 'explicit' | (string & {}),
    reason: string | undefined,
    at: number,
  ): void {
    if (this.halted) return;
    this.halted = true;
    const fromStage = this.ageModel?.stage ?? 'alive';
    const transition = this.ageModel?.markDeceased() ?? null;
    if (transition) {
      const stageEvent: LifeStageChangedEvent = {
        type: LIFE_STAGE_CHANGED,
        at,
        agentId: this.identity.id,
        from: transition.from,
        to: transition.to,
        atAgeSeconds: transition.atAgeSeconds,
      };
      this.publish(stageEvent);
    }
    const died: AgentDiedEvent = {
      type: AGENT_DIED,
      at,
      agentId: this.identity.id,
      cause,
      atAgeSeconds: this.ageModel?.ageSeconds ?? 0,
      ...(reason !== undefined ? { reason } : {}),
    };
    this.publish(died);

    // Force the animation into its 'dead' state so renderers update
    // immediately; reconciliation is inert from now on since halted=true
    // short-circuits future ticks.
    const animationT = this.animation.transition('dead', at, DECEASED_STAGE);
    if (animationT) {
      const animEvent: AnimationTransitionEvent = {
        type: ANIMATION_TRANSITION,
        at,
        agentId: this.identity.id,
        from: animationT.from,
        to: animationT.to,
        reason: DECEASED_STAGE,
      };
      this.publish(animEvent);
    }
    // Suppress unused-var warning if stage wasn't needed.
    void fromStage;
  }

  /** Public death trigger for narrative / event-driven deaths. */
  kill(reason: string): void {
    this.die('explicit', reason, this.clock.now());
  }

  /**
   * Replace the wall-to-virtual time multiplier for subsequent ticks.
   *
   * Applies from the NEXT `tick()` onward — the in-flight tick (if any)
   * keeps its original scale, so determinism under a fixed clock + rng is
   * preserved. Pass `0` to freeze the agent: virtual-time-driven progress
   * (needs decay, aging, random events) halts AND the wall-clock-driven
   * reconciliation stages (modifier expiry, mood, animation) are skipped,
   * so no state transitions leak while paused. `Modifier.expiresAt` is
   * still an absolute wall-clock ms — deferred expiries fire on the first
   * post-resume tick. Use `kill(reason)` for terminal halts.
   *
   * Throws `InvalidTimeScaleError` if `scale` is not finite or is
   * negative.
   */
  setTimeScale(scale: number): void {
    if (!Number.isFinite(scale) || scale < 0) {
      throw new InvalidTimeScaleError(
        `setTimeScale: expected a finite, non-negative number, got ${String(scale)}`,
      );
    }
    this.timeScale = scale;
  }

  /** Current wall-to-virtual time multiplier. */
  getTimeScale(): number {
    return this.timeScale;
  }

  /**
   * Replace the cognition reasoner used by the autonomous tick pipeline.
   *
   * The tick pipeline reads this field fresh at Stage 4/5, so the new
   * reasoner takes effect on the next `selectIntention` call. Callers
   * driving the tick loop from outside the agent (UI handler, framework
   * `onPreUpdate`) see this as "applies from the next tick"; a swap
   * issued from a Stage-1 reactive handler is used within the same
   * tick. Nothing is transferred from the outgoing reasoner; the
   * incoming reasoner's `reset?()` fires synchronously after assignment
   * so the next tick starts from a known-clean baseline. Identity swaps
   * (re-setting the current reasoner) still fire reset — the kernel
   * treats every call as a fresh assignment.
   *
   * Throws `TypeError` if `reasoner` is null / undefined / lacks
   * `selectIntention`.
   */
  setReasoner(reasoner: Reasoner): void {
    if (
      reasoner === null ||
      reasoner === undefined ||
      typeof reasoner.selectIntention !== 'function'
    ) {
      throw new TypeError('setReasoner: expected a Reasoner with a selectIntention method.');
    }
    // `reset` is optional, but when present it MUST be callable. Validating
    // here fails fast at swap-time rather than mid-restore (where a thrown
    // TypeError would leave the agent in a partially-restored state).
    if (reasoner.reset !== undefined && typeof reasoner.reset !== 'function') {
      throw new TypeError('setReasoner: reasoner.reset must be a function when present.');
    }
    this.reasoner = reasoner;
    reasoner.reset?.();
  }

  /** Current cognition reasoner. */
  getReasoner(): Reasoner {
    return this.reasoner;
  }

  // =========================================================================
  // Persistence (M10)
  // =========================================================================

  /**
   * Project the agent's mutable state into a serializable `AgentSnapshot`.
   *
   * `include` lets consumers trim heavy subsystems (e.g., memory) out of the
   * saved payload.
   */
  snapshot(opts: { include?: readonly SnapshotPart[] } = {}): AgentSnapshot {
    const wanted = (part: SnapshotPart): boolean =>
      opts.include === undefined || opts.include.includes(part);

    const snap: AgentSnapshot = {
      schemaVersion: CURRENT_SNAPSHOT_VERSION,
      snapshotAt: this.clock.now(),
      identity: this.identity,
      timeScale: this.timeScale,
    };
    if (this.ageModel && wanted('lifecycle')) {
      snap.lifecycle = this.ageModel.snapshot();
    }
    if (this.needs && wanted('needs')) {
      snap.needs = this.needs.snapshot();
    }
    if (wanted('modifiers')) {
      const list = this.modifiers.list();
      if (list.length > 0) snap.modifiers = [...list];
    }
    if (this.currentMood && wanted('mood')) {
      snap.mood = { ...this.currentMood };
    }
    if (wanted('animation')) {
      snap.animation = {
        state: this.animation.current(),
        activeSkillId: this.currentActiveSkillId,
      };
    }
    if (this.memory && wanted('memory') && isInMemoryMemoryAdapter(this.memory)) {
      const records = this.memory.snapshot();
      if (records.length > 0) snap.memory = [...records];
    }
    return snap;
  }

  /**
   * Restore a snapshot into an already-constructed agent. Replaces the
   * relevant state slices; does NOT replace ports (clock, rng, bus) — those
   * are the consumer's responsibility and are typically re-supplied via
   * `new Agent(deps)` before calling `restore`.
   *
   * "Replaces" extends to collection-shaped slices. When the snapshot
   * includes a `modifiers` slice, pre-existing modifiers on the target
   * agent are wiped before the snapshot's are applied — so a restored
   * agent carries snapshot truth and nothing else. Slices omitted from
   * the snapshot (partial `include`-filtered captures) are left
   * untouched, matching how `needs` / `mood` / `animation` already gate
   * on field presence.
   *
   * If `opts.catchUp` is set, the agent sub-steps forward from
   * `snapshot.snapshotAt` to `clock.now()` using `runCatchUp`.
   *
   * After all subsystem rehydration and catch-up ticks complete,
   * `this.reasoner.reset?.()` is invoked so the first live post-restore
   * tick starts from a known-clean baseline. Reset fires _after_
   * catch-up, not before — catch-up ticks are synthetic and their
   * residual reasoner state (mid-sequence BT nodes, plan accumulators)
   * is intentionally discarded.
   */
  async restore(
    snapshot: AgentSnapshot,
    opts: { catchUp?: boolean | { chunkVirtualSeconds?: number } } = {},
  ): Promise<void> {
    // Apply the snapshotted timeScale first so catch-up (below) and any
    // subsequent ticks run at the cadence the snapshot was taken at, not
    // the fresh agent's constructor value. Pre-v2 snapshots omit this
    // field and keep the constructor value. Routed through
    // `setTimeScale` so a corrupted snapshot (negative / NaN / Infinity)
    // throws `InvalidTimeScaleError` instead of silently poisoning the
    // tick loop.
    if (snapshot.timeScale !== undefined) {
      this.setTimeScale(snapshot.timeScale);
    }
    if (snapshot.lifecycle && this.ageModel) {
      this.ageModel.restore({
        ageSeconds: snapshot.lifecycle.ageSeconds,
        stage: snapshot.lifecycle.stage,
      });
      this.virtualNowSeconds = snapshot.lifecycle.ageSeconds;
      if (snapshot.lifecycle.stage === DECEASED_STAGE) {
        this.halted = true;
      }
    }
    if (snapshot.needs && this.needs) {
      this.needs.restore(snapshot.needs);
    }
    if (snapshot.modifiers) {
      // Restore replaces (not merges) modifier state — see restore()'s
      // contract above. Clear any pre-existing modifiers on the target
      // agent before re-applying the snapshot's. Gated on presence of the
      // `modifiers` slice so partial snapshots (`include: [...]`) still
      // leave unrelated slices untouched on the target.
      for (const existingId of new Set(this.modifiers.list().map((m) => m.id))) {
        this.modifiers.removeAll(existingId);
      }
      const nowMs = this.clock.now();
      for (const mod of snapshot.modifiers) {
        // Boundary case: modifiers whose expiresAt has already passed at
        // the clock's current time are dropped on restore AND a
        // `ModifierExpired` event fires exactly once so downstream
        // consumers (stores, UIs, logs) see the expiration in the same
        // shape they would from a normal tick.
        if (mod.expiresAt !== undefined && mod.expiresAt <= nowMs) {
          this.publish({
            type: MODIFIER_EXPIRED,
            at: nowMs,
            agentId: this.identity.id,
            modifierId: mod.id,
            source: mod.source,
            ...(mod.visual?.fxHint !== undefined ? { fxHint: mod.visual.fxHint } : {}),
          });
          continue;
        }
        this.modifiers.apply(mod);
      }
    }
    if (snapshot.mood) {
      this.currentMood = { ...snapshot.mood };
    }
    if (snapshot.animation) {
      this.animation.restore({ state: snapshot.animation.state });
      this.currentActiveSkillId = snapshot.animation.activeSkillId;
    }
    if (snapshot.memory && this.memory && isInMemoryMemoryAdapter(this.memory)) {
      this.memory.restore(snapshot.memory);
    }

    if (opts.catchUp !== undefined && opts.catchUp !== false) {
      const nowMs = this.clock.now();
      const elapsedMs = Math.max(0, nowMs - snapshot.snapshotAt);
      const elapsedSec = (elapsedMs / 1000) * this.timeScale;
      const chunkOpts =
        typeof opts.catchUp === 'object' && opts.catchUp.chunkVirtualSeconds !== undefined
          ? { chunkVirtualSeconds: opts.catchUp.chunkVirtualSeconds }
          : {};
      await runCatchUp(
        elapsedSec,
        async (chunk) => {
          // Feed virtual dt back through tick(). dt is in real seconds before
          // timeScale; invert it here so total virtual advance matches.
          const realDt = chunk / this.timeScale;
          await this.tick(realDt);
        },
        chunkOpts,
      );
    }

    this.reasoner.reset?.();
  }

  /**
   * Publish an event onto the bus AND record it in the current tick's
   * `emitted` list. Internal helper — skills/modules use `AgentFacade`.
   */
  protected publish(event: DomainEvent): void {
    this.emittedThisTick.push(event);
    this.autoSaveTracker?.observeEvent(event.type);
    this.eventBus.publish(event);
  }

  /**
   * Publish an `InteractionRequested` event carrying the given verb and
   * params. Reactive handlers (typically registered via a consumer module)
   * route it to concrete skills. Keeps UI code free of manual event wiring.
   */
  /**
   * Apply a modifier (buff/debuff). Emits `ModifierApplied`; if stack
   * semantics evicted an existing instance, also emits `ModifierRemoved`
   * with reason `'replaced'`.
   */
  applyModifier(mod: Modifier): Modifier {
    const { applied, removed } = this.modifiers.apply(mod);
    const at = this.clock.now();
    if (removed) {
      const removedEvent: ModifierRemovedEvent = {
        type: MODIFIER_REMOVED,
        at,
        agentId: this.identity.id,
        modifierId: removed.modifier.id,
        source: removed.modifier.source,
        reason: removed.reason === 'replaced' ? 'replaced' : 'removed',
      };
      this.publish(removedEvent);
    }
    const appliedEvent: ModifierAppliedEvent = {
      type: MODIFIER_APPLIED,
      at,
      agentId: this.identity.id,
      modifier: applied,
      ...(applied.visual?.fxHint !== undefined ? { fxHint: applied.visual.fxHint } : {}),
    };
    this.publish(appliedEvent);
    return applied;
  }

  /** Remove a modifier by id. Emits `ModifierRemoved` with reason `'removed'`. */
  removeModifier(id: string): Modifier | null {
    const removed = this.modifiers.remove(id);
    if (!removed) return null;
    const event: ModifierRemovedEvent = {
      type: MODIFIER_REMOVED,
      at: this.clock.now(),
      agentId: this.identity.id,
      modifierId: removed.id,
      source: removed.source,
      reason: 'removed',
    };
    this.publish(event);
    return removed;
  }

  interact(verb: string, params?: Record<string, unknown>): void {
    this.eventBus.publish({
      type: INTERACTION_REQUESTED,
      at: this.clock.now(),
      agentId: this.identity.id,
      verb,
      ...(params !== undefined ? { params } : {}),
    });
  }

  /**
   * Subscribe to every event on the agent's bus. Sugar over
   * `eventBus.subscribe(listener)` that keeps consumers from having to
   * reach for the bus directly. Useful for Pinia / Zustand / Redux / Svelte
   * store integration — handler calls `agent.getState()` and pushes into
   * the store.
   */
  subscribe(listener: (event: DomainEvent) => void): () => void {
    return this.eventBus.subscribe(listener);
  }

  /**
   * Project the agent's current mutable state into a cheap, frame-safe slice.
   * Call freely from subscription handlers; does not allocate heavy objects.
   *
   * Fields populate over Phase A milestones — M2 returns the identity/
   * lifecycle shell, M3 adds needs, M4 modifiers, M5 mood, M8 animation.
   */
  getState(): AgentState {
    return {
      id: this.identity.id,
      stage: this.ageModel?.stage ?? (this.halted ? DECEASED_STAGE : 'alive'),
      halted: this.halted,
      ageSeconds: this.ageModel?.ageSeconds ?? 0,
      needs: this.needs?.snapshot() ?? {},
      modifiers: this.modifiers.list().map((m) => ({
        id: m.id,
        ...(m.expiresAt !== undefined ? { expiresAt: m.expiresAt } : {}),
      })),
      ...(this.currentMood !== undefined
        ? { mood: { category: this.currentMood.category, updatedAt: this.currentMood.updatedAt } }
        : {}),
      animation: this.halted ? 'dead' : this.animation.current(),
    };
  }

  /**
   * Install an `AgentModule` after construction. `createAgent` installs
   * modules via its config at construction time; this method is exposed
   * so tests can add handlers mid-scenario. Runtime install for consumer
   * use is not yet part of the supported public surface.
   */
  installModule(mod: AgentModule): void {
    this.modules.push(mod);
    for (const handler of mod.reactiveHandlers ?? []) {
      this.reactiveHandlers.push(handler);
    }
    mod.onInstall?.(this.facade());
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /** Build the read-only facade passed to modules and (later) skills. */
  protected facade(): AgentFacade {
    return {
      identity: this.identity,
      clock: this.clock,
      rng: this.rng,
      logger: this.logger,
      publishEvent: (event: DomainEvent) => {
        this.publishEvent(event);
      },
      invokeSkill: async (skillId, params) => {
        await this.cognitionPipeline.invokeSkillAction(
          skillId,
          params,
          this.cognitionPipeline.skillContext(),
          this.clock.now(),
        );
      },
      getTimeScale: () => this.timeScale,
    };
  }

  /** Dispatch reactive handlers for a batch of perceived events. */
  protected async dispatchReactiveHandlers(events: readonly DomainEvent[]): Promise<void> {
    if (this.reactiveHandlers.length === 0 || events.length === 0) return;
    const facade = this.facade();
    for (const event of events) {
      for (const handler of this.reactiveHandlers) {
        if (handler.on !== '*' && handler.on !== event.type) continue;
        try {
          await handler.handle(event, facade);
        } catch (cause) {
          this.logger.warn('reactive handler failed', {
            eventType: event.type,
            cause: String(cause),
          });
        }
      }
    }
  }
}

function isInMemoryMemoryAdapter(m: MemoryRepository): m is InMemoryMemoryAdapter {
  return m instanceof InMemoryMemoryAdapter;
}
