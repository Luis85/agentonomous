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
