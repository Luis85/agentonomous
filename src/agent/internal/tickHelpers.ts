import { isInvokeSkillAction, type AgentAction } from '../AgentAction.js';
import type { DomainEvent } from '../../events/DomainEvent.js';
import type { ControlMode } from '../ControlMode.js';
import type { DecisionTrace } from '../DecisionTrace.js';
import { DECEASED_STAGE } from '../../lifecycle/LifeStage.js';
import type { IntentionCandidate } from '../../cognition/IntentionCandidate.js';
import type { LifeStageTransition } from '../../lifecycle/AgeModel.js';
import type { ModifierRemoval } from '../../modifiers/Modifiers.js';
import type { NeedsDelta } from '../../needs/Need.js';

/**
 * Selected-action summary for `AgentTickedEvent`. `null` when the tick
 * decided no action; otherwise mirrors the action's discriminant + (for
 * invoke-skill) the skill id.
 */
export type SelectedActionSummary = { type: string; skillId?: string } | null;

/**
 * Inputs that feed `Agent.tick`'s `deltas` record. Each field is omitted
 * from the resulting record when empty / null — keeps the trace shape
 * stable across ticks where a subsystem produced nothing.
 */
export type TickDeltasInput = {
  needsDeltas: readonly NeedsDelta[];
  expired: readonly ModifierRemoval[];
  activeModifierIds: readonly string[];
  stageTransitions: readonly LifeStageTransition[];
  moodChange: { from: string | undefined; to: string; valence: number | undefined } | null;
  animationTransition: { from: string; to: string; reason?: string } | null;
  candidates: readonly IntentionCandidate[];
};

/** Inputs needed to assemble a halted-tick `DecisionTrace`. */
export type HaltedTraceInput = {
  agentId: string;
  tickStartedAt: number;
  virtualDtSeconds: number;
  controlMode: ControlMode;
  perceived: readonly DomainEvent[];
  emitted: readonly DomainEvent[];
};

/**
 * Builds the optional `deltas` record from the per-stage tick outputs.
 * Returns `undefined` when no subsystem produced anything — keeps
 * `DecisionTrace.deltas` cleanly absent on idle ticks.
 */
export function buildTickDeltas(input: TickDeltasInput): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  if (input.needsDeltas.length > 0) out.needs = input.needsDeltas;
  if (input.expired.length > 0) out.modifiersExpired = input.expired.map((r) => r.modifier.id);
  if (input.activeModifierIds.length > 0) out.activeModifiers = input.activeModifierIds;
  if (input.stageTransitions.length > 0) out.stageTransitions = input.stageTransitions;
  if (input.moodChange) out.mood = input.moodChange;
  if (input.animationTransition) out.animation = input.animationTransition;
  if (input.candidates.length > 0) out.candidates = input.candidates;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Builds the `DecisionTrace` returned from a halted tick (deceased
 * short-circuit at Stage -1 or mid-tick death from Stage 2.5 needs).
 * Both call-sites share the same shape; centralizing prevents drift.
 */
export function buildHaltedTrace(input: HaltedTraceInput): DecisionTrace {
  return {
    agentId: input.agentId,
    tickStartedAt: input.tickStartedAt,
    virtualDtSeconds: input.virtualDtSeconds,
    controlMode: input.controlMode,
    stage: DECEASED_STAGE,
    halted: true,
    perceived: input.perceived,
    actions: [],
    emitted: input.emitted,
  };
}

/**
 * Maps the tick's first decided action (if any) to the
 * `AgentTickedEvent.selectedAction` summary shape.
 */
export function summarizeSelectedAction(actions: readonly AgentAction[]): SelectedActionSummary {
  const first = actions[0];
  if (first === undefined) return null;
  if (isInvokeSkillAction(first)) {
    return { type: first.type, skillId: first.skillId };
  }
  return { type: first.type };
}
