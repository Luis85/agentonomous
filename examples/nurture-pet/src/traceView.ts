import { isEmitEventAction, isInvokeSkillAction } from 'agentonomous';
import type { Agent, AgentState, DecisionTrace, IntentionCandidate } from 'agentonomous';
import { NEEDS } from './constants.js';

const VISIBILITY_STORAGE_KEY = 'agentonomous/trace-visible';
const TOP_CANDIDATES = 5;

/**
 * Mount the "Decision Trace" inspector panel. Hidden by default (progressive
 * disclosure); the toggle state is persisted under `agentonomous/trace-visible`.
 *
 * The returned `render` should be called with the latest `DecisionTrace`
 * returned from `Agent.tick(dt)` and the current `AgentState`. When the
 * panel is collapsed, `render` is a near-no-op.
 */
export function mountTraceView(agent: Agent): {
  render(trace: DecisionTrace, state: AgentState, tickNumber: number): void;
} {
  const panel = document.getElementById('decision-trace') as HTMLElement | null;
  const toggle = document.getElementById('decision-trace-toggle') as HTMLButtonElement | null;
  const body = document.getElementById('decision-trace-body') as HTMLElement | null;
  if (!panel || !toggle || !body) {
    return { render: () => {} };
  }

  const initiallyVisible = readVisible();
  applyVisibility(panel, toggle, initiallyVisible);

  toggle.addEventListener('click', () => {
    const next = panel.dataset.visible !== 'true';
    applyVisibility(panel, toggle, next);
    writeVisible(next);
  });

  // Build the four section hosts once. The per-frame `render` only rewrites
  // a section's `innerHTML` when its serialized signature actually changed —
  // steady-state ticks are near-zero DOM work.
  const summaryEl = document.createElement('div');
  summaryEl.className = 'trace-summary';
  const needsEl = document.createElement('section');
  needsEl.className = 'trace-section';
  const candidatesEl = document.createElement('section');
  candidatesEl.className = 'trace-section';
  const selectionEl = document.createElement('section');
  selectionEl.className = 'trace-section';
  body.appendChild(summaryEl);
  body.appendChild(needsEl);
  body.appendChild(candidatesEl);
  body.appendChild(selectionEl);

  const prev = { summary: '', needs: '', candidates: '', selection: '' };

  return {
    render(trace, state, tickNumber) {
      if (panel.dataset.visible !== 'true') return;
      const timeScale = agent.getTimeScale();

      const summary = buildSummary(trace, state, timeScale, tickNumber);
      if (summary !== prev.summary) {
        summaryEl.innerHTML = summary;
        prev.summary = summary;
      }

      const needs = buildNeeds(state, trace);
      if (needs !== prev.needs) {
        needsEl.innerHTML = needs;
        prev.needs = needs;
      }

      const candidates = buildCandidates(trace);
      if (candidates !== prev.candidates) {
        candidatesEl.innerHTML = candidates;
        prev.candidates = candidates;
      }

      const selection = buildSelection(trace);
      if (selection !== prev.selection) {
        selectionEl.innerHTML = selection;
        prev.selection = selection;
      }
    },
  };
}

function buildSummary(
  trace: DecisionTrace,
  state: AgentState,
  timeScale: number,
  tickNumber: number,
): string {
  const paused = timeScale === 0;
  const mode = paused ? 'paused' : trace.controlMode;
  const dt = trace.virtualDtSeconds.toFixed(3);
  return (
    `<div class="trace-row"><span class="trace-k">tick</span><span class="trace-v">#${tickNumber}</span></div>` +
    `<div class="trace-row"><span class="trace-k">mode</span><span class="trace-v">${escapeHtml(mode)}</span></div>` +
    `<div class="trace-row"><span class="trace-k">stage</span><span class="trace-v">${escapeHtml(state.stage)}</span></div>` +
    `<div class="trace-row"><span class="trace-k">virtual dt</span><span class="trace-v">${escapeHtml(dt)}s</span></div>`
  );
}

function buildNeeds(state: AgentState, trace: DecisionTrace): string {
  const candidates = getCandidates(trace);
  const urgencyByNeed = new Map<string, number>();
  for (const c of candidates) {
    if (c.source !== 'needs') continue;
    const match = /^satisfy-need:(.+)$/.exec(c.intention.type);
    const needId = match?.[1] ?? c.intention.target;
    if (needId && !urgencyByNeed.has(needId)) {
      urgencyByNeed.set(needId, c.score);
    }
  }

  const rows = NEEDS.map((need) => {
    const level = state.needs[need.id] ?? 0;
    const urgency = urgencyByNeed.get(need.id);
    const urgencyStr = urgency === undefined ? '—' : urgency.toFixed(2);
    return (
      `<div class="trace-row">` +
      `<span class="trace-k">${escapeHtml(need.label)}</span>` +
      `<span class="trace-v">${level.toFixed(2)} · urgency ${escapeHtml(urgencyStr)}</span>` +
      `</div>`
    );
  }).join('');
  return `<h4>Needs</h4>${rows}`;
}

function buildCandidates(trace: DecisionTrace): string {
  const candidates = getCandidates(trace);
  if (candidates.length === 0) {
    return `<h4>Candidates</h4><div class="trace-empty">none</div>`;
  }
  // Candidates arrive pre-sorted by the reasoner; copy then sort defensively
  // so the panel never misleads if a future change drops the invariant.
  const sorted = [...candidates].sort((a, b) => b.score - a.score).slice(0, TOP_CANDIDATES);
  const rows = sorted
    .map(
      (c) =>
        `<div class="trace-row">` +
        `<span class="trace-k">${escapeHtml(c.intention.type)}</span>` +
        `<span class="trace-v">${c.score.toFixed(2)} · ${escapeHtml(c.source)}</span>` +
        `</div>`,
    )
    .join('');
  return `<h4>Candidates (${candidates.length})</h4>${rows}`;
}

function buildSelection(trace: DecisionTrace): string {
  if (trace.actions.length === 0) {
    return `<h4>Selected</h4><div class="trace-empty">${escapeHtml(whyNoAction(trace))}</div>`;
  }
  const rows = trace.actions
    .map((a) => {
      if (isInvokeSkillAction(a)) {
        const params = a.params ? ` · ${escapeHtml(JSON.stringify(a.params))}` : '';
        return `<div class="trace-row"><span class="trace-k">invoke-skill</span><span class="trace-v">${escapeHtml(a.skillId)}${params}</span></div>`;
      }
      if (isEmitEventAction(a)) {
        return `<div class="trace-row"><span class="trace-k">emit-event</span><span class="trace-v">${escapeHtml(a.event.type)}</span></div>`;
      }
      return `<div class="trace-row"><span class="trace-k">${escapeHtml(a.type)}</span><span class="trace-v">—</span></div>`;
    })
    .join('');
  const why = whyForSelection(trace);
  return `<h4>Selected</h4>${rows}<div class="trace-why">${escapeHtml(why)}</div>`;
}

function whyForSelection(trace: DecisionTrace): string {
  const top = getCandidates(trace)[0];
  if (!top) return 'no candidates — direct interaction';
  return `top candidate: ${top.intention.type} (${top.source}, ${top.score.toFixed(2)})`;
}

function whyNoAction(trace: DecisionTrace): string {
  if (trace.halted) return 'halted';
  const candidates = getCandidates(trace);
  if (candidates.length === 0) return 'no candidates this tick';
  return `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} — no action emitted`;
}

function getCandidates(trace: DecisionTrace): readonly IntentionCandidate[] {
  const raw = trace.deltas?.['candidates'];
  return Array.isArray(raw) ? (raw as readonly IntentionCandidate[]) : [];
}

function applyVisibility(panel: HTMLElement, toggle: HTMLButtonElement, visible: boolean): void {
  panel.dataset.visible = String(visible);
  toggle.setAttribute('aria-expanded', String(visible));
  toggle.textContent = visible ? 'Hide decision trace' : 'Show decision trace';
}

function readVisible(): boolean {
  try {
    return globalThis.localStorage?.getItem(VISIBILITY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeVisible(visible: boolean): void {
  try {
    globalThis.localStorage?.setItem(VISIBILITY_STORAGE_KEY, String(visible));
  } catch {
    // localStorage unavailable — tolerate silently.
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
