/**
 * Trace-projection helpers for `<TracePanel>`.
 *
 * The presentation layer cannot take a runtime import on `agentonomous`
 * (per design's DDD layering). Trace inspection still needs the
 * `isInvokeSkillAction` / `isEmitEventAction` discriminators, so they
 * are wrapped here once and re-exported as plain row records the
 * component can render without naming the framework symbols.
 */

import { isEmitEventAction, isInvokeSkillAction } from 'agentonomous';
import type { DecisionTrace, IntentionCandidate } from 'agentonomous';

/** A `(label, detail)` row rendered as one line in the panel. */
export type TraceRow = { readonly k: string; readonly v: string };

export function projectSelectionRows(trace: DecisionTrace): ReadonlyArray<TraceRow> {
  return trace.actions.map((a) => {
    if (isInvokeSkillAction(a)) {
      const params = a.params ? ` · ${JSON.stringify(a.params)}` : '';
      return { k: 'invoke-skill', v: `${a.skillId}${params}` };
    }
    if (isEmitEventAction(a)) {
      return { k: 'emit-event', v: a.event.type };
    }
    return { k: a.type, v: '—' };
  });
}

export function projectCandidates(trace: DecisionTrace): readonly IntentionCandidate[] {
  const raw = trace.deltas?.['candidates'];
  return Array.isArray(raw) ? (raw as readonly IntentionCandidate[]) : [];
}
