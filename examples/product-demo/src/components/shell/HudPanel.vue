<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, onUnmounted, ref, watch } from 'vue';
import type { AgentState } from 'agentonomous';
import { useAgentSession } from '../../stores/domain/useAgentSession.js';
import { useSelectorRegistry } from '../../stores/view/useSelectorRegistry.js';
import type { SelectorHandle } from '../../demo-domain/walkthrough/types.js';

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

const HUD_NEEDS_HANDLE = 'hud.needs' as unknown as SelectorHandle;

const session = useAgentSession();
const registry = useSelectorRegistry();

// Template refs in `<script setup>` get hoisted to module-scoped
// constants by `@vitejs/plugin-vue`'s production transform, which makes
// `useTemplateRef` and `:ref="fnRef"` brittle under Vue Test Utils'
// component wrapper (the inner SFC's vnodes look "hoisted" from VTU's
// perspective and the binding warning fires). Resolve the highlight
// host lazily via `instance.proxy.$el.querySelector(...)` after mount —
// the data attribute is the durable handle and `<TourOverlay>` looks
// it up through the registry the same way regardless.
const instance = getCurrentInstance();
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
  const root = instance?.proxy?.$el as HTMLElement | undefined;
  const host = root?.querySelector?.<HTMLElement>('[data-tour-handle="hud.needs"]') ?? null;
  if (host !== null) registry.register(HUD_NEEDS_HANDLE, host);
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
  // `setNeedsHost(null)` runs as part of unmount and removes the
  // handle; defensively call again here so an early teardown path
  // (e.g. throw mid-mount) cannot leave a dangling registration.
  registry.unregister(HUD_NEEDS_HANDLE);
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
.buttons {
  background: var(--panel-bg, #fff);
  border-radius: 12px;
  padding: 16px;
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
