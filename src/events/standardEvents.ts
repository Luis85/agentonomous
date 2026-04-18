import type { Modifier } from '../modifiers/Modifier.js';
import type { DomainEvent } from './DomainEvent.js';

/**
 * Strongly-typed standard events the library emits. Each concrete event type
 * lands in the milestone that introduces the matching subsystem; this file
 * is the single place the constants live so consumers can subscribe by
 * string without spelunking through the source tree.
 */

// --- Needs (M3) ---
export const NEED_CRITICAL = 'NeedCritical' as const;
export const NEED_SAFE = 'NeedSafe' as const;
export const NEED_SATISFIED = 'NeedSatisfied' as const;

export interface NeedCriticalEvent extends DomainEvent {
  type: typeof NEED_CRITICAL;
  agentId: string;
  needId: string;
  level: number;
}

export interface NeedSafeEvent extends DomainEvent {
  type: typeof NEED_SAFE;
  agentId: string;
  needId: string;
  level: number;
}

export interface NeedSatisfiedEvent extends DomainEvent {
  type: typeof NEED_SATISFIED;
  agentId: string;
  needId: string;
  before: number;
  after: number;
}

// --- Modifiers (M4) ---
export const MODIFIER_APPLIED = 'ModifierApplied' as const;
export const MODIFIER_EXPIRED = 'ModifierExpired' as const;
export const MODIFIER_REMOVED = 'ModifierRemoved' as const;

export interface ModifierAppliedEvent extends DomainEvent {
  type: typeof MODIFIER_APPLIED;
  agentId: string;
  modifier: Modifier;
}

export interface ModifierExpiredEvent extends DomainEvent {
  type: typeof MODIFIER_EXPIRED;
  agentId: string;
  modifierId: string;
  source: string;
}

export interface ModifierRemovedEvent extends DomainEvent {
  type: typeof MODIFIER_REMOVED;
  agentId: string;
  modifierId: string;
  source: string;
  reason: 'removed' | 'replaced';
}
