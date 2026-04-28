<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { AgentState } from 'agentonomous';
import { useAgentSession } from '../../stores/domain/useAgentSession.js';
import type { CognitionModeSpec } from '../../stores/domain/useAgentSession.js';
import { useRegisterSelector } from '../../composables/useRegisterSelector.js';

type NeedDef = { readonly id: string; readonly label: string };
type InteractionDef = { readonly verb: string; readonly label: string };
type LifetimeCounters = {
  ateCount: number;
  scoldedCount: number;
  illnessCount: number;
  petCount: number;
};
type ModifierVisual = { readonly label?: string; readonly hudIcon?: string };
type ModifierLike = {
  readonly id: string;
  readonly visual?: ModifierVisual;
  readonly expiresAt?: number;
};

const NEEDS: ReadonlyArray<NeedDef> = [
  { id: 'hunger', label: 'Hunger' },
  { id: 'cleanliness', label: 'Cleanliness' },
  { id: 'happiness', label: 'Happiness' },
  { id: 'energy', label: 'Energy' },
  { id: 'health', label: 'Health' },
];

const INTERACTION_BUTTONS: ReadonlyArray<InteractionDef> = [
  { verb: 'feed', label: '🍖 Feed' },
  { verb: 'clean', label: '🫧 Clean' },
  { verb: 'play', label: '🎾 Play' },
  { verb: 'rest', label: '💤 Rest' },
  { verb: 'pet', label: '❤️ Pet' },
  { verb: 'medicate', label: '💊 Medicate' },
  { verb: 'scold', label: '😠 Scold' },
];

const STAGE_LABELS: Record<string, string> = {
  alive: 'Alive',
  egg: 'Egg',
  kitten: 'Kitten',
  adult: 'Cat',
  elder: 'Elder Cat',
  deceased: 'Deceased',
};

const session = useAgentSession();
useRegisterSelector('hud.needs');
useRegisterSelector('hud.cognition.toggle');
useRegisterSelector('hud.cognition.indicator');
useRegisterSelector('hud.json.toggle');

// Cognition picker (Pillar-1 slice 1.3): minimal placeholder until
// Pillar-2 slice 2.5 ports the legacy cognitionSwitcher with its loss
// sparkline + prediction strip. Probes the peer dep on first hover so
// unavailable modes render disabled with an install hint. `learning`
// stays force-disabled here regardless of TF.js availability — the
// store's `setCognitionMode` only wires the reasoner, not the paired
// `TfjsLearner`, so enabling the option would silently disable online
// training while the UI claims "Active: learning". The full switcher
// (cognitionSwitcher.ts) is the supported path until slice 2.5.
const cognitionAvailable = ref<Record<CognitionModeSpec['id'], boolean>>({
  heuristic: true,
  bt: false,
  bdi: false,
  learning: false,
});
const cognitionError = ref<string | null>(null);

async function probeCognitionModes(): Promise<void> {
  for (const mode of session.cognitionModes) {
    if (mode.id === 'heuristic') continue;
    // See `cognitionAvailable` JSDoc — `learning` is intentionally
    // pinned to false here. The store-side `setCognitionMode` also
    // throws on `'learning'` as a defence-in-depth guard.
    if (mode.id === 'learning') continue;
    try {
      cognitionAvailable.value = {
        ...cognitionAvailable.value,
        [mode.id]: await mode.probe(),
      };
    } catch {
      cognitionAvailable.value = { ...cognitionAvailable.value, [mode.id]: false };
    }
  }
}

async function handleCognitionChange(event: Event): Promise<void> {
  const target = event.target as HTMLSelectElement;
  const next = target.value as CognitionModeSpec['id'];
  cognitionError.value = null;
  try {
    await session.setCognitionMode(next);
  } catch (err) {
    cognitionError.value = (err as Error).message;
    // Revert the select to whatever the session actually applied.
    target.value = session.cognitionModeId;
  }
}

function handleJsonPreview(): void {
  // Pillar-4 placeholder: chapter-4 advances when this UI event fires.
  // Pillar-4 slice 4.3 swaps the button for the real preview/commit
  // editor, which will emit the same event when the preview opens.
  session.recordUiEvent('ConfigPreviewOpened');
}

const state = ref<AgentState | null>(null);
const modifiers = ref<ReadonlyArray<ModifierLike>>([]);
const paused = ref<boolean>(false);
const counters = ref<LifetimeCounters>({
  ateCount: 0,
  scoldedCount: 0,
  illnessCount: 0,
  petCount: 0,
});
const lifeSummary = ref<{ name: string; diedAtMs: number } | null>(null);

const stageText = computed(() => {
  if (state.value === null) return '—';
  const label = STAGE_LABELS[state.value.stage] ?? state.value.stage;
  return `${label} — ${formatAge(state.value.ageSeconds)} old`;
});
const moodText = computed(() => `mood: ${state.value?.mood?.category ?? '—'}`);
const animationText = computed(() => `anim: ${state.value?.animation ?? '—'}`);
const petName = computed(() => session.agent?.identity.name ?? 'pet');

const petIcon = computed(() => {
  const s = state.value;
  if (s === null) return { glyph: '🐱', bg: '#fde68a' };
  if (s.halted) return { glyph: '💀', bg: '#475569' };
  if (s.modifiers.some((m) => m.id === 'dirty')) return { glyph: '😾', bg: '#a8a29e' };
  if (s.animation === 'sleeping') return { glyph: '😴', bg: '#93c5fd' };
  if (s.animation === 'eating') return { glyph: '😋', bg: '#fcd34d' };
  if (s.animation === 'sick') return { glyph: '🤒', bg: '#d1d5db' };
  if (s.mood?.category === 'sad') return { glyph: '😢', bg: '#bfdbfe' };
  if (s.mood?.category === 'playful') return { glyph: '😺', bg: '#fde68a' };
  return { glyph: '🐱', bg: '#fde68a' };
});

let unsubscribe: (() => void) | null = null;

function refreshFromAgent(): void {
  const agent = session.agent;
  if (agent === null) return;
  state.value = agent.getState();
  modifiers.value = agent.modifiers.list() as ReadonlyArray<ModifierLike>;
  paused.value = agent.getTimeScale() === 0;
}

function tally(eventType: string, evt: Record<string, unknown>): void {
  if (eventType === 'SkillCompleted') {
    const skillId = typeof evt['skillId'] === 'string' ? (evt['skillId'] as string) : '';
    if (skillId === 'feed') counters.value.ateCount += 1;
    else if (skillId === 'scold') counters.value.scoldedCount += 1;
    else if (skillId === 'pet') counters.value.petCount += 1;
  } else if (eventType === 'RandomEvent' && evt['subtype'] === 'mildIllness') {
    counters.value.illnessCount += 1;
  }
}

function clearLifetimeStats(): void {
  counters.value = { ateCount: 0, scoldedCount: 0, illnessCount: 0, petCount: 0 };
  lifeSummary.value = null;
}

// Reset HUD-local lifetime stats whenever the session swaps in a fresh
// agent (Reset button → `replayFromSnapshot(null)` / "New pet" button /
// any future scenario switch). Without this the next death summary
// leaks counters from the previous pet, contradicting Reset's
// "lifetime stats … will be lost" confirmation. The watcher fires
// post-mount with its first non-null value, but counters already start
// at zero so re-zeroing is a no-op then.
watch(
  () => session.agent,
  (next, prev) => {
    if (next !== prev) clearLifetimeStats();
  },
);

onMounted(() => {
  refreshFromAgent();
  void probeCognitionModes();
  unsubscribe = session.subscribe((event) => {
    refreshFromAgent();
    tally(event.type, event as unknown as Record<string, unknown>);
    if (event.type === 'AgentDied') {
      const agent = session.agent;
      const name = agent?.identity.name ?? agent?.identity.id ?? 'pet';
      const at = (event as unknown as { at: number }).at;
      lifeSummary.value = { name, diedAtMs: at };
    }
  });
});

onUnmounted(() => {
  unsubscribe?.();
});

function levelOf(needId: string): number {
  return state.value?.needs[needId] ?? 0;
}

function levelPct(needId: string): string {
  return `${Math.max(0, Math.min(100, levelOf(needId) * 100)).toFixed(0)}%`;
}

function isCritical(needId: string): boolean {
  return levelOf(needId) < 0.25;
}

function modifierLabel(mod: ModifierLike): string {
  const icon = mod.visual?.hudIcon;
  const name = mod.visual?.label ?? mod.id;
  return icon ? `${icon} ${name}` : name;
}

function modifierTime(mod: ModifierLike): string | null {
  if (typeof mod.expiresAt !== 'number') return null;
  if (paused.value) return 'paused';
  const agent = session.agent;
  if (agent === null) return null;
  const remainingMs = Math.max(0, mod.expiresAt - agent.clock.now());
  return formatRemaining(remainingMs);
}

function invoke(verb: string): void {
  session.agent?.interact(verb);
}

function dismissLifeSummary(): void {
  lifeSummary.value = null;
}

function newPet(): void {
  // The session.agent watcher above clears `counters` + `lifeSummary`
  // once the rebuild swaps the agent ref — no need to duplicate it here.
  void session.replayFromSnapshot(null);
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

function formatDiedAt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}
</script>

<template>
  <section class="hud-panel">
    <div class="stage">
      <div class="pet-canvas" :style="{ background: petIcon.bg }">
        {{ petIcon.glyph }}
      </div>
      <div class="pet-meta">
        <strong>{{ petName }}</strong>
        <div>{{ stageText }}</div>
        <div>{{ moodText }}</div>
        <div>{{ animationText }}</div>
      </div>
    </div>

    <div class="bars" data-tour-handle="hud.needs">
      <div v-for="need in NEEDS" :key="need.id" class="bar">
        <span>{{ need.label }}</span>
        <div class="bar-track">
          <div
            class="bar-fill"
            :class="{ critical: isCritical(need.id) }"
            :style="{ width: levelPct(need.id) }"
          />
        </div>
        <span class="bar-value">{{ levelOf(need.id).toFixed(2) }}</span>
      </div>
    </div>

    <div class="cognition">
      <label class="cognition__label" for="cognition-mode"> Cognition mode </label>
      <select
        id="cognition-mode"
        class="cognition__select"
        data-tour-handle="hud.cognition.toggle"
        :value="session.cognitionModeId"
        @change="handleCognitionChange"
      >
        <option
          v-for="mode in session.cognitionModes"
          :key="mode.id"
          :value="mode.id"
          :disabled="!cognitionAvailable[mode.id]"
        >
          {{ mode.label
          }}{{
            !cognitionAvailable[mode.id] && mode.peerName !== null
              ? ` (install ${mode.peerName})`
              : ''
          }}
        </option>
      </select>
      <span class="cognition__indicator" data-tour-handle="hud.cognition.indicator">
        Active: <strong>{{ session.cognitionModeId }}</strong>
      </span>
      <p v-if="cognitionError !== null" class="cognition__error" role="alert">
        {{ cognitionError }}
      </p>
    </div>

    <div class="json-preview">
      <button
        type="button"
        class="json-preview__button"
        data-tour-handle="hud.json.toggle"
        @click="handleJsonPreview"
      >
        🛠️ Preview JSON (placeholder)
      </button>
    </div>

    <div class="modifiers">
      <strong>Buffs / debuffs</strong>
      <ul>
        <li v-for="(mod, idx) in modifiers" :key="`${mod.id}#${idx}`">
          {{ modifierLabel(mod) }}
          <span v-if="modifierTime(mod) !== null" class="mod-time"> {{ modifierTime(mod) }}</span>
        </li>
      </ul>
    </div>

    <div class="buttons">
      <button
        v-for="def in INTERACTION_BUTTONS"
        :key="def.verb"
        type="button"
        @click="invoke(def.verb)"
      >
        {{ def.label }}
      </button>
    </div>

    <div v-if="lifeSummary !== null" class="life-summary" role="dialog" aria-modal="true">
      <div class="life-summary__card">
        <h2>🪦 {{ lifeSummary.name }}</h2>
        <p>Passed away at {{ formatDiedAt(lifeSummary.diedAtMs) }}.</p>
        <ul>
          <li>
            🍖 Fed <strong>{{ counters.ateCount }}</strong> times
          </li>
          <li>
            ❤️ Petted <strong>{{ counters.petCount }}</strong> times
          </li>
          <li>
            😠 Scolded <strong>{{ counters.scoldedCount }}</strong> times
          </li>
          <li>
            🤒 Caught <strong>{{ counters.illnessCount }}</strong> illnesses
          </li>
        </ul>
        <div class="life-summary__actions">
          <button type="button" class="life-summary__close" @click="dismissLifeSummary">
            Close
          </button>
          <button type="button" class="life-summary__new" @click="newPet">🔄 New pet</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hud-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stage {
  background: var(--panel-bg, #fff);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.pet-canvas {
  width: 96px;
  height: 96px;
  border-radius: 48px;
  display: grid;
  place-items: center;
  font-size: 40px;
  transition:
    background 0.3s,
    transform 0.3s;
}

.pet-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-variant-numeric: tabular-nums;
}

.bars,
.modifiers,
.buttons,
.cognition,
.json-preview {
  background: var(--panel-bg, #fff);
  border-radius: 12px;
  padding: 16px;
}

.cognition {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.cognition__label {
  font-weight: 600;
}

.cognition__select {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
}

.cognition__indicator {
  opacity: 0.7;
}

.cognition__error {
  flex-basis: 100%;
  margin: 0;
  color: #dc2626;
  font-size: 12px;
}

.json-preview__button {
  padding: 6px 10px;
  border-radius: 6px;
  border: none;
  background: #0ea5e9;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.json-preview__button:hover {
  background: #0284c7;
}

.bar {
  display: grid;
  grid-template-columns: 120px 1fr auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.bar-track {
  height: 12px;
  border-radius: 6px;
  background: #e2e8f0;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: #38bdf8;
  transition: width 0.3s;
}

.bar-fill.critical {
  background: #f43f5e;
  animation: critical-pulse 1.1s ease-in-out infinite;
}

@keyframes critical-pulse {
  0%,
  100% {
    opacity: 1;
    filter: brightness(1);
  }
  50% {
    opacity: 0.75;
    filter: brightness(1.15);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bar-fill.critical {
    animation: none;
  }
}

.bar-value {
  font-variant-numeric: tabular-nums;
}

.modifiers ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.modifiers li {
  padding: 4px 8px;
  border-radius: 6px;
  background: #fef3c7;
  color: #713f12;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.mod-time {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
  font-size: 11px;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.buttons button {
  padding: 8px 14px;
  border-radius: 8px;
  border: none;
  background: #4f46e5;
  color: #fff;
  cursor: pointer;
  font-weight: 600;
}

.buttons button:hover {
  background: #4338ca;
}

.life-summary {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  display: grid;
  place-items: center;
  z-index: 9999;
}

.life-summary__card {
  background: #fafafa;
  color: #0f172a;
  padding: 24px 28px;
  border-radius: 12px;
  max-width: 360px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  text-align: center;
}

.life-summary__card h2 {
  margin: 0 0 8px;
  font-size: 22px;
}

.life-summary__card ul {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
  text-align: left;
  font-size: 15px;
}

.life-summary__actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.life-summary__close,
.life-summary__new {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 14px;
}

.life-summary__close {
  background: #cbd5e1;
  color: #0f172a;
}

.life-summary__new {
  background: #2563eb;
  color: white;
}
</style>
