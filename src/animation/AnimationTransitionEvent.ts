import type { DomainEvent } from '../events/DomainEvent.js';
import type { AnimationState } from './AnimationState.js';

/**
 * Emitted every time an agent's animation state rotates. Renderers
 * subscribe to decide which sprite clip / particle burst / sound cue to
 * play. `fxHint` carries an optional renderer-side nudge.
 */
export type AnimationTransitionEvent = DomainEvent & {
  type: 'AnimationTransition';
  agentId: string;
  from: AnimationState;
  to: AnimationState;
  reason?: string;
};

export const ANIMATION_TRANSITION = 'AnimationTransition' as const;
