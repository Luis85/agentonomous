<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { IntentionCandidate } from 'agentonomous';
import { useAgentSession } from '../../stores/domain/useAgentSession.js';
import { projectCandidates, projectSelectionRows } from '../../composables/useTraceSelectors.js';
import { useRegisterSelector } from '../../composables/useRegisterSelector.js';

type NeedDef = { readonly id: string; readonly label: string };

const NEEDS: ReadonlyArray<NeedDef> = [
  { id: 'hunger', label: 'Hunger' },
  { id: 'cleanliness', label: 'Cleanliness' },
  { id: 'happiness', label: 'Happiness' },
  { id: 'energy', label: 'Energy' },
  { id: 'health', label: 'Health' },
];

const TOP_CANDIDATES = 5;
const VISIBILITY_STORAGE_KEY = 'demo.v2.trace.visible';

const session = useAgentSession();
const visible = ref(readVisible());
useRegisterSelector('trace.panel');

function readVisible(): boolean {
  try {
    return globalThis.localStorage?.getItem(VISIBILITY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeVisible(next: boolean): void {
  try {
    globalThis.localStorage?.setItem(VISIBILITY_STORAGE_KEY, String(next));
  } catch {
    // localStorage unavailable; silently skip.
  }
}

function toggle(): void {
  const next = !visible.value;
  visible.value = next;
  writeVisible(next);
  // Tour-aware UI signal: chapter-2 step "trace-open" advances when the
  // user reveals the panel for the first time on the current step.
  if (next) session.recordUiEvent('TracePanelOpened');
}

const allCandidates = computed<readonly IntentionCandidate[]>(() => {
  const trace = session.lastTrace;
  return trace === null ? [] : projectCandidates(trace);
});

const candidates = computed<readonly IntentionCandidate[]>(() => {
  return [...allCandidates.value].sort((a, b) => b.score - a.score).slice(0, TOP_CANDIDATES);
});

const urgencyByNeed = computed<Map<string, number>>(() => {
  const map = new Map<string, number>();
  for (const c of allCandidates.value) {
    if (c.source !== 'needs') continue;
    const match = /^satisfy-need:(.+)$/.exec(c.intention.type);
    const needId = match?.[1] ?? c.intention.target;
    if (needId !== undefined && !map.has(needId)) map.set(needId, c.score);
  }
  return map;
});

const summaryRows = computed(() => {
  const t = session.lastTrace;
  const agent = session.agent;
  if (t === null || agent === null) return [];
  const paused = agent.getTimeScale() === 0;
  const mode = paused ? 'paused' : t.controlMode;
  const stage = agent.getState().stage;
  return [
    { k: 'tick', v: `#${session.lastTickNumber}` },
    { k: 'mode', v: mode },
    { k: 'stage', v: stage },
    { k: 'virtual dt', v: `${t.virtualDtSeconds.toFixed(3)}s` },
  ];
});

const selectionRows = computed(() => {
  const t = session.lastTrace;
  return t === null ? [] : projectSelectionRows(t);
});

const whyText = computed(() => {
  const t = session.lastTrace;
  if (t === null) return '';
  if (t.actions.length > 0) {
    const top = allCandidates.value[0];
    if (!top) return 'no candidates — direct interaction';
    return `top candidate: ${top.intention.type} (${top.source}, ${top.score.toFixed(2)})`;
  }
  if (t.halted) return 'halted';
  const count = allCandidates.value.length;
  if (count === 0) return 'no candidates this tick';
  return `${count} candidate${count === 1 ? '' : 's'} — no action emitted`;
});

function urgencyText(needId: string): string {
  const u = urgencyByNeed.value.get(needId);
  return u === undefined ? '—' : u.toFixed(2);
}

function levelText(needId: string): string {
  const agent = session.agent;
  return (agent?.getState().needs[needId] ?? 0).toFixed(2);
}

onMounted(() => {
  // No subscription needed — `session.lastTrace` / `lastTickNumber`
  // update reactively from useAgentSession's internal listener.
  //
  // Tour-aware UI signal: if the panel was restored visible from
  // `demo.v2.trace.visible` (returning user), emit `TracePanelOpened`
  // here so chapter-2's `trace-open` predicate doesn't get stuck
  // waiting for a hidden→visible toggle that already happened in a
  // previous session.
  if (visible.value) session.recordUiEvent('TracePanelOpened');
});
</script>

<template>
  <section class="trace-panel" data-tour-handle="trace.panel" :data-visible="String(visible)">
    <button
      type="button"
      class="trace-panel__toggle"
      :aria-expanded="String(visible)"
      aria-controls="trace-panel-body"
      @click="toggle"
    >
      {{ visible ? 'Hide decision trace' : 'Show decision trace' }}
    </button>
    <div v-show="visible" id="trace-panel-body" class="trace-panel__body">
      <div class="trace-summary">
        <div v-for="row in summaryRows" :key="row.k" class="trace-row">
          <span class="trace-k">{{ row.k }}</span>
          <span class="trace-v">{{ row.v }}</span>
        </div>
      </div>
      <section class="trace-section">
        <h4>Needs</h4>
        <div v-for="need in NEEDS" :key="need.id" class="trace-row">
          <span class="trace-k">{{ need.label }}</span>
          <span class="trace-v">
            {{ levelText(need.id) }} · urgency {{ urgencyText(need.id) }}
          </span>
        </div>
      </section>
      <section class="trace-section">
        <h4>Candidates ({{ allCandidates.length }})</h4>
        <div v-if="candidates.length === 0" class="trace-empty">none</div>
        <div v-for="c in candidates" :key="`${c.intention.type}#${c.score}`" class="trace-row">
          <span class="trace-k">{{ c.intention.type }}</span>
          <span class="trace-v">{{ c.score.toFixed(2) }} · {{ c.source }}</span>
        </div>
      </section>
      <section class="trace-section">
        <h4>Selected</h4>
        <div v-if="selectionRows.length === 0" class="trace-empty">{{ whyText }}</div>
        <div v-for="(row, idx) in selectionRows" :key="idx" class="trace-row">
          <span class="trace-k">{{ row.k }}</span>
          <span class="trace-v">{{ row.v }}</span>
        </div>
        <div v-if="selectionRows.length > 0" class="trace-why">{{ whyText }}</div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.trace-panel {
  background: var(--panel-bg, #fff);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trace-panel__toggle {
  background: #64748b;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  padding: 6px 10px;
  align-self: flex-start;
  cursor: pointer;
}

.trace-panel__toggle:hover {
  background: #475569;
}

.trace-panel__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.trace-section h4 {
  margin: 0 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
}

.trace-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 0;
}

.trace-k {
  opacity: 0.8;
}

.trace-v {
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.trace-empty {
  opacity: 0.6;
  font-style: italic;
}

.trace-why {
  margin-top: 6px;
  opacity: 0.75;
  font-style: italic;
}
</style>
