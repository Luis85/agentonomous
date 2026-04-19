import type { DomainEvent } from '../events/DomainEvent.js';
import type { EventBusPort } from '../events/EventBusPort.js';
import {
  AGENT_DIED,
  LIFE_STAGE_CHANGED,
  MODIFIER_APPLIED,
  MODIFIER_EXPIRED,
  MODIFIER_REMOVED,
  MOOD_CHANGED,
  NEED_CRITICAL,
  NEED_SAFE,
  type AgentDiedEvent,
  type LifeStageChangedEvent,
  type ModifierAppliedEvent,
  type ModifierExpiredEvent,
  type ModifierRemovedEvent,
  type MoodChangedEvent,
  type NeedCriticalEvent,
  type NeedSafeEvent,
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
import type { IntentionCandidate } from '../cognition/IntentionCandidate.js';
import type { Learner } from '../cognition/learning/Learner.js';
import { NoopLearner } from '../cognition/learning/NoopLearner.js';
import type { Reasoner } from '../cognition/reasoning/Reasoner.js';
import { UrgencyReasoner } from '../cognition/reasoning/UrgencyReasoner.js';
import type { NeedsPolicy } from '../needs/NeedsPolicy.js';
import type { AgeModel, LifeStageTransition } from '../lifecycle/AgeModel.js';
import { DECEASED_STAGE, type LifeStage } from '../lifecycle/LifeStage.js';
import type { StageCapabilityMap } from '../lifecycle/StageCapabilities.js';
import { stageAllowsSkill } from '../lifecycle/StageCapabilities.js';
import type { MemoryRepository } from '../memory/MemoryRepository.js';
import type { Modifier } from '../modifiers/Modifier.js';
import type { ModifierRemoval } from '../modifiers/Modifiers.js';
import { Modifiers } from '../modifiers/Modifiers.js';
import type { Mood } from '../mood/Mood.js';
import type { MoodModel } from '../mood/MoodModel.js';
import type { NeedsDelta } from '../needs/Need.js';
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
import type { SkillError, SkillOutcome } from '../skills/Skill.js';
import type { SkillContext } from '../skills/SkillContext.js';
import { SkillRegistry } from '../skills/SkillRegistry.js';
import {
  SKILL_COMPLETED,
  SKILL_FAILED,
  type SkillCompletedEvent,
  type SkillFailedEvent,
} from '../events/standardEvents.js';
import type { Result } from './result.js';
import { isInvokeSkillAction } from './AgentAction.js';
import type { RemoteController } from './RemoteController.js';
import type { ScriptedController } from './ScriptedController.js';
import type { Rng } from '../ports/Rng.js';
import type { WallClock } from '../ports/WallClock.js';
import type { Logger } from '../ports/Logger.js';
import { NullLogger } from '../ports/Logger.js';
import type { Validator } from '../ports/Validator.js';
import type { AgentState } from '../persistence/AgentState.js';
import { INTERACTION_REQUESTED } from '../interaction/InteractionRequestedEvent.js';
import type { AgentAction } from './AgentAction.js';
import type { AgentFacade } from './AgentFacade.js';
import type { AgentIdentity } from './AgentIdentity.js';
import type { AgentModule, ReactiveHandler } from './AgentModule.js';
import type { ControlMode } from './ControlMode.js';
import type { DecisionTrace } from './DecisionTrace.js';
import { MissingDependencyError } from './errors.js';

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
  readonly reasoner: Reasoner;
  readonly behavior: BehaviorRunner;
  readonly learner: Learner;
  readonly skills: SkillRegistry;
  readonly needsPolicy: NeedsPolicy | undefined;
  readonly animation: AnimationStateMachine;
  /** Id of the skill whose execution is currently driving the animation (if any). */
  protected currentActiveSkillId: string | undefined;
  protected readonly autoSaveTracker: AutoSaveTracker | undefined;
  protected currentMood: Mood | undefined;
  /** Cumulative virtual seconds tracked for random-event cooldown bookkeeping. */
  protected virtualNowSeconds = 0;

  protected readonly timeScale: number;
  protected controlMode: ControlMode;
  protected halted = false;
  protected readonly reactiveHandlers: ReactiveHandler[] = [];
  protected readonly modules: AgentModule[] = [];
  /** Events queued for inclusion in the current tick's `emitted` field. */
  protected emittedThisTick: DomainEvent[] = [];

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

    // Install config-time modules.
    for (const mod of deps.modules ?? []) {
      this.installModule(mod);
    }
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
    const virtualDtSeconds = Math.max(0, dtSeconds) * this.timeScale;

    // Stage -1: halted short-circuit.
    if (this.halted) {
      return {
        agentId: this.identity.id,
        tickStartedAt,
        virtualDtSeconds,
        controlMode: this.controlMode,
        stage: 'deceased',
        halted: true,
        perceived: [],
        actions: [],
        emitted: [],
      };
    }

    this.emittedThisTick = [];

    // Stage 0: advance age + life stages (catch-up-aware).
    const stageTransitions = this.runLifecycleTick(virtualDtSeconds, tickStartedAt);

    // Stage 1: perceive — drain pending events from the bus.
    const perceived = this.eventBus.drain();
    await this.dispatchReactiveHandlers(perceived);

    // Stage 1.5: random events — publish seeded random events onto the bus.
    this.virtualNowSeconds += virtualDtSeconds;
    this.runRandomEventsTick(virtualDtSeconds, tickStartedAt);

    // Stage 2: modifier tick — expire time-bound modifiers.
    const expired = this.runModifiersTick(tickStartedAt);

    // Stage 2.5: needs tick. Decay (scaled by modifier multipliers), critical crossings → events.
    // If health just hit 0 during decay we die here and short-circuit.
    const needsDeltas = this.runNeedsTick(virtualDtSeconds, tickStartedAt);
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
        emitted: this.emittedThisTick,
      };
    }

    // Stage 2.7: mood evaluate.
    const moodChange = this.runMoodTick(tickStartedAt);
    // Stage 2.8: animation reconcile.
    const animationTransition = this.runAnimationTick(tickStartedAt);

    // Stage 3: dispatch by control mode.
    const actions: AgentAction[] = await this.collectActions(tickStartedAt, perceived);

    // Stage 7: execute actions (skills + noops + custom).
    await this.executeActions(actions, tickStartedAt);

    // Stage 4-7: cognition (M7 wires UrgencyReasoner + DirectBehaviorRunner).
    // Stage 8:   score (learner) (M7 stub).

    // Stage 9: persist + autosave (M10).
    if (this.autoSaveTracker) {
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
      emitted: this.emittedThisTick,
      ...(deltas ? { deltas } : {}),
    };

    await this.maybeAutoSave();
    return trace;
  }

  /** Collect actions for this tick based on `controlMode`. */
  protected async collectActions(
    wallNowMs: number,
    perceived: readonly DomainEvent[],
  ): Promise<AgentAction[]> {
    switch (this.controlMode) {
      case 'remote': {
        if (!this.remote) return [];
        const pulled = await this.remote.pull(this.identity.id, wallNowMs);
        return [...pulled];
      }
      case 'scripted': {
        if (!this.scripted) return [];
        const next = this.scripted.next(this.identity.id, wallNowMs);
        return next ? [...next] : [];
      }
      case 'autonomous':
      default:
        return this.runAutonomousCognition(perceived);
    }
  }

  /** Autonomous cognition pipeline — Stage 4 (candidates) + 5 (select) + 6 (behavior). */
  protected runAutonomousCognition(perceived: readonly DomainEvent[]): AgentAction[] {
    const candidates: IntentionCandidate[] = [];
    if (this.needs && this.needsPolicy) {
      for (const c of this.needsPolicy.suggest(this.needs, this.identity.persona)) {
        candidates.push(c);
      }
    }
    const intention = this.reasoner.selectIntention({
      perceived,
      needs: this.needs,
      modifiers: this.modifiers,
      ...(this.identity.persona !== undefined ? { persona: this.identity.persona } : {}),
      candidates,
    });
    if (!intention) return [];
    return [...this.behavior.run(intention)];
  }

  /** Stage 7: dispatch actions — invoke-skill goes through the registry. */
  protected async executeActions(
    actions: readonly AgentAction[],
    wallNowMs: number,
  ): Promise<void> {
    if (actions.length === 0) return;
    const ctx = this.skillContext();
    for (const action of actions) {
      if (action.type === 'noop') continue;
      if (isInvokeSkillAction(action)) {
        await this.invokeSkillAction(action.skillId, action.params, ctx, wallNowMs);
        continue;
      }
      if (action.type === 'emit-event' && 'event' in action) {
        const event = (action as { event: DomainEvent }).event;
        this.publish(event);
        continue;
      }
      // Unknown action kinds are left for consumer modules to interpret;
      // they can subscribe and react via reactive handlers next tick.
    }
  }

  /**
   * Invoke a skill through the registry, honoring stage capabilities + modifier
   * effectiveness, and emit the appropriate SkillCompleted / SkillFailed event.
   */
  protected async invokeSkillAction(
    skillId: string,
    params: Record<string, unknown> | undefined,
    ctx: SkillContext,
    wallNowMs: number,
  ): Promise<void> {
    // Stage capability gate.
    if (this.ageModel && this.stageCapabilities) {
      if (!stageAllowsSkill(this.stageCapabilities, this.ageModel.stage, skillId)) {
        const event: SkillFailedEvent = {
          type: SKILL_FAILED,
          at: wallNowMs,
          agentId: this.identity.id,
          skillId,
          code: 'stage-blocked',
          message: `Skill '${skillId}' is blocked at stage '${this.ageModel.stage}'.`,
        };
        this.publish(event);
        return;
      }
    }
    if (!this.skills.has(skillId)) {
      const event: SkillFailedEvent = {
        type: SKILL_FAILED,
        at: wallNowMs,
        agentId: this.identity.id,
        skillId,
        code: 'not-registered',
        message: `No skill registered with id '${skillId}'.`,
      };
      this.publish(event);
      return;
    }
    // Expose the running skill to the animation reconciler. Scoped to this
    // invocation so multiple sequential skills don't leak state.
    const previousActive = this.currentActiveSkillId;
    this.currentActiveSkillId = skillId;
    const result: Result<SkillOutcome, SkillError> = await this.skills
      .invoke(skillId, params, ctx)
      .finally(() => {
        this.currentActiveSkillId = previousActive;
      });
    if (result.ok) {
      const skill = this.skills.get(skillId);
      const base = skill?.baseEffectiveness ?? 1;
      const effectiveness =
        (result.value.effectiveness ?? base) * this.modifiers.skillEffectiveness(skillId);
      const event: SkillCompletedEvent = {
        type: SKILL_COMPLETED,
        at: wallNowMs,
        agentId: this.identity.id,
        skillId,
        effectiveness,
        ...(result.value.fxHint !== undefined ? { fxHint: result.value.fxHint } : {}),
        ...(result.value.details !== undefined ? { details: result.value.details } : {}),
      };
      this.publish(event);
      this.learner.score({
        intention: { kind: 'satisfy', type: skillId },
        actions: [{ type: 'invoke-skill', skillId, ...(params !== undefined ? { params } : {}) }],
        details: { effectiveness },
      });
    } else {
      const event: SkillFailedEvent = {
        type: SKILL_FAILED,
        at: wallNowMs,
        agentId: this.identity.id,
        skillId,
        code: result.error.code,
        message: result.error.message,
        ...(result.error.details !== undefined ? { details: result.error.details } : {}),
      };
      this.publish(event);
    }
  }

  /** Build the SkillContext passed to every skill execution. */
  protected skillContext(): SkillContext {
    return {
      identity: this.identity,
      clock: this.clock,
      rng: this.rng,
      satisfyNeed: (needId, amount) => {
        this.needs?.satisfy(needId, amount);
      },
      applyModifier: (mod) => this.applyModifier(mod),
      removeModifier: (id) => this.removeModifier(id),
      publishEvent: (event) => {
        this.publish(event);
      },
      ageSeconds: () => this.ageModel?.ageSeconds ?? 0,
    };
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

  /** Advance age + life stages; emit LifeStageChanged for each crossed threshold. */
  protected runLifecycleTick(virtualDtSeconds: number, at: number): readonly LifeStageTransition[] {
    if (!this.ageModel) return [];
    const transitions = this.ageModel.advance(virtualDtSeconds);
    for (const t of transitions) {
      const event: LifeStageChangedEvent = {
        type: LIFE_STAGE_CHANGED,
        at,
        agentId: this.identity.id,
        from: t.from,
        to: t.to,
        atAgeSeconds: t.atAgeSeconds,
      };
      this.publish(event);
    }
    return transitions;
  }

  /** Reconcile the animation state machine and emit AnimationTransition if it rotated. */
  protected runAnimationTick(at: number): { from: string; to: string; reason?: string } | null {
    const transition = this.animation.reconcile({
      modifiers: this.modifiers,
      wallNowMs: at,
      ...(this.currentActiveSkillId !== undefined
        ? { activeSkillId: this.currentActiveSkillId }
        : {}),
      ...(this.currentMood?.category !== undefined ? { mood: this.currentMood.category } : {}),
    });
    if (!transition) return null;
    const event: AnimationTransitionEvent = {
      type: ANIMATION_TRANSITION,
      at,
      agentId: this.identity.id,
      from: transition.from,
      to: transition.to,
      ...(transition.reason !== undefined ? { reason: transition.reason } : {}),
      ...(transition.fxHint !== undefined ? { fxHint: transition.fxHint } : {}),
    };
    this.publish(event);
    return {
      from: transition.from,
      to: transition.to,
      ...(transition.reason !== undefined ? { reason: transition.reason } : {}),
    };
  }

  /** Evaluate the mood model and emit MoodChanged if the category rotated. */
  protected runMoodTick(
    at: number,
  ): { from: string | undefined; to: string; valence: number | undefined } | null {
    if (!this.moodModel) return null;
    const previous = this.currentMood;
    const next = this.moodModel.evaluate({
      needs: this.needs,
      modifiers: this.modifiers,
      persona: this.identity.persona,
      wallNowMs: at,
      previous,
    });
    this.currentMood = next;
    if (previous && previous.category === next.category) return null;
    const event: MoodChangedEvent = {
      type: MOOD_CHANGED,
      at,
      agentId: this.identity.id,
      from: previous?.category,
      to: next.category,
      valence: next.valence,
    };
    this.publish(event);
    return { from: previous?.category, to: next.category, valence: next.valence };
  }

  /** Expire time-bound modifiers and publish `ModifierExpired` events. */
  protected runModifiersTick(at: number): readonly ModifierRemoval[] {
    const expired = this.modifiers.tick(at);
    for (const removal of expired) {
      const event: ModifierExpiredEvent = {
        type: MODIFIER_EXPIRED,
        at,
        agentId: this.identity.id,
        modifierId: removal.modifier.id,
        source: removal.modifier.source,
        ...(removal.modifier.visual?.fxHint !== undefined
          ? { fxHint: removal.modifier.visual.fxHint }
          : {}),
      };
      this.publish(event);
    }
    return expired;
  }

  /** Run the Needs.tick step and emit critical/safe events for threshold crossings. */
  protected runNeedsTick(virtualDtSeconds: number, at: number): readonly NeedsDelta[] {
    if (!this.needs || virtualDtSeconds <= 0) return [];
    const deltas = this.needs.tick(virtualDtSeconds, (id) => this.modifiers.decayMultiplier(id));
    let healthDepleted = false;
    for (const delta of deltas) {
      if (delta.crossedCritical) {
        const event: NeedCriticalEvent = {
          type: NEED_CRITICAL,
          at,
          agentId: this.identity.id,
          needId: delta.needId,
          level: delta.after,
        };
        this.publish(event);
      } else if (delta.crossedSafe) {
        const event: NeedSafeEvent = {
          type: NEED_SAFE,
          at,
          agentId: this.identity.id,
          needId: delta.needId,
          level: delta.after,
        };
        this.publish(event);
      }
      if (delta.needId === 'health' && delta.after <= 0) {
        healthDepleted = true;
      }
    }
    if (healthDepleted && !this.halted) {
      this.die('health-depleted', undefined, at);
    }
    return deltas;
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
    const animationT = this.animation.transition('dead', at, 'deceased');
    if (animationT) {
      const animEvent: AnimationTransitionEvent = {
        type: ANIMATION_TRANSITION,
        at,
        agentId: this.identity.id,
        from: animationT.from,
        to: animationT.to,
        reason: 'deceased',
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
   * If `opts.catchUp` is set, the agent sub-steps forward from
   * `snapshot.snapshotAt` to `clock.now()` using `runCatchUp`.
   */
  async restore(
    snapshot: AgentSnapshot,
    opts: { catchUp?: boolean | { chunkVirtualSeconds?: number } } = {},
  ): Promise<void> {
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
      for (const mod of snapshot.modifiers) {
        // Drop already-expired modifiers up front.
        if (mod.expiresAt !== undefined && mod.expiresAt <= this.clock.now()) continue;
        this.modifiers.apply(mod);
      }
    }
    if (snapshot.mood) {
      this.currentMood = { ...snapshot.mood };
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
   * modules via its config at construction time; this method is exposed so
   * tests can add handlers mid-scenario. Runtime install for consumer use
   * is a Phase B concern.
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
        this.eventBus.publish(event);
      },
      invokeSkill: async (skillId, params) => {
        await this.invokeSkillAction(skillId, params, this.skillContext(), this.clock.now());
      },
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
