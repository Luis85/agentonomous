import type { DomainEvent } from '../events/DomainEvent.js';
import type { EventBusPort } from '../events/EventBusPort.js';
import {
  MODIFIER_APPLIED,
  MODIFIER_EXPIRED,
  MODIFIER_REMOVED,
  NEED_CRITICAL,
  NEED_SAFE,
  type ModifierAppliedEvent,
  type ModifierExpiredEvent,
  type ModifierRemovedEvent,
  type NeedCriticalEvent,
  type NeedSafeEvent,
} from '../events/standardEvents.js';
import type { Modifier } from '../modifiers/Modifier.js';
import type { ModifierRemoval } from '../modifiers/Modifiers.js';
import { Modifiers } from '../modifiers/Modifiers.js';
import type { NeedsDelta } from '../needs/Need.js';
import type { Needs } from '../needs/Needs.js';
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

    // Stage 0: advance time. (Lifecycle stage transitions land in M5.)

    // Stage 1: perceive — drain pending events from the bus.
    const perceived = this.eventBus.drain();
    await this.dispatchReactiveHandlers(perceived);

    // Stage 1.5: random events. (M11)

    // Stage 2: modifier tick — expire time-bound modifiers.
    const expired = this.runModifiersTick(tickStartedAt);

    // Stage 2.5: needs tick. Decay (scaled by modifier multipliers), critical crossings → events.
    const needsDeltas = this.runNeedsTick(virtualDtSeconds, tickStartedAt);

    // Stage 2.7: mood evaluate. (M5)
    // Stage 2.8: animation reconcile. (M8)

    // Stage 3: dispatch by control mode. In M3 only 'autonomous' is wired
    // and the cognition pipeline is a no-op; M6 adds scripted/remote.
    const actions: AgentAction[] = [];

    // Stage 4-7: cognition (M7).
    // Stage 8:   score (learner) (M7 stub).
    // Stage 9:   persist + autosave (M10).

    // Stage 10: return trace.
    const deltasRecord: Record<string, unknown> = {};
    if (needsDeltas.length > 0) deltasRecord.needs = needsDeltas;
    if (expired.length > 0) deltasRecord.modifiersExpired = expired.map((r) => r.modifier.id);
    const activeModifierIds = this.modifiers.list().map((m) => m.id);
    if (activeModifierIds.length > 0) deltasRecord.activeModifiers = activeModifierIds;
    const deltas = Object.keys(deltasRecord).length > 0 ? deltasRecord : undefined;

    return {
      agentId: this.identity.id,
      tickStartedAt,
      virtualDtSeconds,
      controlMode: this.controlMode,
      stage: 'alive',
      halted: false,
      perceived,
      actions,
      emitted: this.emittedThisTick,
      ...(deltas ? { deltas } : {}),
    };
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
    }
    return deltas;
  }

  /**
   * Publish an event onto the bus AND record it in the current tick's
   * `emitted` list. Internal helper — skills/modules use `AgentFacade`.
   */
  protected publish(event: DomainEvent): void {
    this.emittedThisTick.push(event);
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
      stage: this.halted ? 'deceased' : 'alive',
      halted: this.halted,
      ageSeconds: 0, // M5
      needs: this.needs?.snapshot() ?? {},
      modifiers: this.modifiers.list().map((m) => ({
        id: m.id,
        ...(m.expiresAt !== undefined ? { expiresAt: m.expiresAt } : {}),
      })),
      animation: 'idle', // M8
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
