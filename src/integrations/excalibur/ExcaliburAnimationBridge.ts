import type { Agent } from '../../agent/Agent.js';
import type { AnimationState } from '../../animation/AnimationState.js';
import {
  ANIMATION_TRANSITION,
  type AnimationTransitionEvent,
} from '../../animation/AnimationTransitionEvent.js';
import type { ActorLike } from './types.js';

/**
 * Subscribes to `AnimationTransition` events on the agent's bus and swaps
 * the actor's active graphic. Consumers supply a map from agent animation
 * state → Excalibur graphic name or instance.
 *
 * The bridge returns an `unsubscribe()` handle so it can be torn down
 * cleanly on scene transitions.
 */
export type ExcaliburAnimationBridgeOptions = {
  agent: Agent;
  actor: ActorLike;
  /**
   * Map from `AnimationState` to either a graphic name (`'cat-eat'`) or
   * any Excalibur graphic instance the consumer has pre-registered with
   * `actor.graphics.add(...)`.
   */
  graphicsByState: Readonly<Record<string, unknown>>;
  /**
   * Fallback graphic when the current state isn't in the map. Optional;
   * when omitted the bridge leaves the current graphic in place.
   */
  fallback?: unknown;
};

export class ExcaliburAnimationBridge {
  private readonly agent: Agent;
  private readonly actor: ActorLike;
  private readonly map: Readonly<Record<string, unknown>>;
  private readonly fallback: unknown;
  private unsubscribe: (() => void) | null = null;

  constructor(opts: ExcaliburAnimationBridgeOptions) {
    this.agent = opts.agent;
    this.actor = opts.actor;
    this.map = opts.graphicsByState;
    this.fallback = opts.fallback;
  }

  /** Start listening. Immediately pushes the current state onto the actor. */
  attach(): void {
    this.applyState(this.agent.animation.current());
    this.unsubscribe = this.agent.subscribe((event) => {
      if (event.type !== ANIMATION_TRANSITION) return;
      const t = event as AnimationTransitionEvent;
      this.applyState(t.to);
    });
  }

  /** Stop listening. Safe to call more than once. */
  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private applyState(state: AnimationState): void {
    const graphic = this.map[state] ?? this.fallback;
    if (graphic !== undefined) {
      this.actor.graphics.use(graphic);
    }
  }
}
