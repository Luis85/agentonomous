import type { LifeStage } from '../lifecycle/LifeStage.js';
import type { Modifier } from '../modifiers/Modifier.js';
import type { MoodCategory } from '../mood/Mood.js';
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

// --- Lifecycle (M5) ---
export const LIFE_STAGE_CHANGED = 'LifeStageChanged' as const;
export const AGENT_DIED = 'AgentDied' as const;

export interface LifeStageChangedEvent extends DomainEvent {
  type: typeof LIFE_STAGE_CHANGED;
  agentId: string;
  from: LifeStage;
  to: LifeStage;
  atAgeSeconds: number;
}

export interface AgentDiedEvent extends DomainEvent {
  type: typeof AGENT_DIED;
  agentId: string;
  cause: 'health-depleted' | 'stage-transition' | 'explicit' | (string & {});
  reason?: string;
  atAgeSeconds: number;
}

// --- Skills (M7) ---
export const SKILL_COMPLETED = 'SkillCompleted' as const;
export const SKILL_FAILED = 'SkillFailed' as const;

export interface SkillCompletedEvent extends DomainEvent {
  type: typeof SKILL_COMPLETED;
  agentId: string;
  skillId: string;
  effectiveness: number;
  details?: Record<string, unknown>;
}

export interface SkillFailedEvent extends DomainEvent {
  type: typeof SKILL_FAILED;
  agentId: string;
  skillId: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// --- Mood (M5) ---
export const MOOD_CHANGED = 'MoodChanged' as const;

export interface MoodChangedEvent extends DomainEvent {
  type: typeof MOOD_CHANGED;
  agentId: string;
  from: MoodCategory | undefined;
  to: MoodCategory;
  valence: number | undefined;
}
