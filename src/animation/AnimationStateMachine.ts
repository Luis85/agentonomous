import type { Modifiers } from '../modifiers/Modifiers.js';
import type { MoodCategory } from '../mood/Mood.js';
import type { AnimationState } from './AnimationState.js';

/** A recorded state rotation. Useful for debug overlays + replay tests. */
export type AnimationTransition = {
  from: AnimationState;
  to: AnimationState;
  at: number;
  reason?: string;
  fxHint?: string;
};

export type ReconcileContext = {
  activeSkillId?: string;
  mood?: MoodCategory;
  modifiers?: Modifiers;
  wallNowMs: number;
};

/**
 * Options for `AnimationStateMachine`. Consumers tune how the reconciler
 * maps (active skill + mood + modifiers) onto concrete animation states.
 *
 * - `skillMap` maps a running skill id to its "during execution" state
 *   (e.g., `feed → 'eating'`).
 * - `modifierOverrides` maps a modifier id to a forcing state (e.g.,
 *   `sick → 'sick'`). The first matching present modifier wins.
 * - `moodMap` maps a mood category onto an animation state when no skill
 *   or modifier is driving.
 * - `idleState` is the fallback. Default `'idle'`.
 * - `maxHistorySize` caps the in-memory transition log. Default `1000`.
 *   On overflow the oldest entry is evicted. Guards long-running agents
 *   against unbounded history growth.
 */
export type AnimationStateMachineOptions = {
  skillMap?: Readonly<Record<string, AnimationState>>;
  modifierOverrides?: Readonly<Record<string, AnimationState>>;
  moodMap?: Readonly<Record<string, AnimationState>>;
  idleState?: AnimationState;
  maxHistorySize?: number;
};

export const DEFAULT_ANIMATION_HISTORY_SIZE = 1000;

/**
 * State machine routing (active skill + mood + modifiers) to a single
 * `AnimationState`. Pure apart from the history buffer; every transition
 * call yields an event the agent publishes onto the bus.
 */
export class AnimationStateMachine {
  private currentState: AnimationState = 'idle';
  private readonly historyLog: AnimationTransition[] = [];
  private readonly skillMap: Readonly<Record<string, AnimationState>>;
  private readonly modifierOverrides: Readonly<Record<string, AnimationState>>;
  private readonly moodMap: Readonly<Record<string, AnimationState>>;
  private readonly idleState: AnimationState;
  private readonly maxHistorySize: number;

  constructor(opts: AnimationStateMachineOptions = {}) {
    this.skillMap = opts.skillMap ?? {};
    this.modifierOverrides = opts.modifierOverrides ?? { sick: 'sick' };
    this.moodMap = opts.moodMap ?? {
      sad: 'sad',
      happy: 'happy',
      playful: 'playing',
      sleepy: 'sleeping',
      bored: 'idle',
      sick: 'sick',
    };
    this.idleState = opts.idleState ?? 'idle';
    this.currentState = this.idleState;
    this.maxHistorySize = Math.max(1, opts.maxHistorySize ?? DEFAULT_ANIMATION_HISTORY_SIZE);
  }

  private pushHistory(t: AnimationTransition): void {
    this.historyLog.push(t);
    if (this.historyLog.length > this.maxHistorySize) {
      this.historyLog.shift();
    }
  }

  current(): AnimationState {
    return this.currentState;
  }

  history(): readonly AnimationTransition[] {
    return this.historyLog;
  }

  /**
   * Force an explicit transition. Skips reconciliation. `at` is the wall
   * ms at which the transition occurred; callers MUST pass it rather than
   * patching post-hoc. Returns the transition, or `null` if we're already
   * in `next`.
   */
  transition(
    next: AnimationState,
    at: number,
    reason?: string,
    fxHint?: string,
  ): AnimationTransition | null {
    if (next === this.currentState) return null;
    const t: AnimationTransition = {
      from: this.currentState,
      to: next,
      at,
      ...(reason !== undefined ? { reason } : {}),
      ...(fxHint !== undefined ? { fxHint } : {}),
    };
    this.currentState = next;
    this.pushHistory(t);
    return t;
  }

  /**
   * Derive the right state from context priority:
   *   1. Deceased: forced 'dead' (caller sets reason = DECEASED_STAGE).
   *   2. Modifier override wins (sick / stunned / etc).
   *   3. Running skill.
   *   4. Mood mapping.
   *   5. Fallback to idle.
   */
  reconcile(ctx: ReconcileContext): AnimationTransition | null {
    const next = this.pickNext(ctx);
    if (next === this.currentState) return null;
    const t: AnimationTransition = {
      from: this.currentState,
      to: next,
      at: ctx.wallNowMs,
      reason: this.reasonFor(ctx, next),
    };
    this.currentState = next;
    this.pushHistory(t);
    return t;
  }

  snapshot(): { state: AnimationState } {
    return { state: this.currentState };
  }

  restore(snap: { state: AnimationState }): void {
    this.currentState = snap.state;
  }

  private pickNext(ctx: ReconcileContext): AnimationState {
    if (ctx.modifiers) {
      for (const mod of ctx.modifiers.list()) {
        const mapped = this.modifierOverrides[mod.id];
        if (mapped !== undefined) return mapped;
      }
    }
    if (ctx.activeSkillId !== undefined) {
      const mapped = this.skillMap[ctx.activeSkillId];
      if (mapped !== undefined) return mapped;
    }
    if (ctx.mood !== undefined) {
      const mapped = this.moodMap[ctx.mood];
      if (mapped !== undefined) return mapped;
    }
    return this.idleState;
  }

  private reasonFor(ctx: ReconcileContext, next: AnimationState): string {
    if (ctx.modifiers) {
      for (const mod of ctx.modifiers.list()) {
        if (this.modifierOverrides[mod.id] === next) return `modifier:${mod.id}`;
      }
    }
    if (ctx.activeSkillId !== undefined && this.skillMap[ctx.activeSkillId] === next) {
      return `skill:${ctx.activeSkillId}`;
    }
    if (ctx.mood !== undefined && this.moodMap[ctx.mood] === next) {
      return `mood:${ctx.mood}`;
    }
    return 'idle';
  }
}
