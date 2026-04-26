<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAgentSession } from '../../stores/domain/useAgentSession.js';

type SpeedChoice = {
  readonly label: string;
  readonly ariaLabel: string;
  readonly mult: number | 'pause';
};

const SPEED_STORAGE_KEY = 'demo.v2.session.speed';

const CHOICES: ReadonlyArray<SpeedChoice> = [
  { label: '⏸ Pause', ariaLabel: 'Pause', mult: 'pause' },
  { label: '0.5×', ariaLabel: '0.5x speed', mult: 0.5 },
  { label: '1×', ariaLabel: '1x speed', mult: 1 },
  { label: '2×', ariaLabel: '2x speed', mult: 2 },
  { label: '4×', ariaLabel: '4x speed', mult: 4 },
  { label: '8×', ariaLabel: '8x speed', mult: 8 },
];

const session = useAgentSession();
const active = ref<number | 'pause'>(1);

function readSaved(): number | 'pause' | null {
  try {
    const raw = globalThis.localStorage?.getItem(SPEED_STORAGE_KEY);
    if (raw === null || raw === undefined) return null;
    if (raw === 'pause') return 'pause';
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeSaved(value: number | 'pause'): void {
  try {
    globalThis.localStorage?.setItem(
      SPEED_STORAGE_KEY,
      value === 'pause' ? 'pause' : String(value),
    );
  } catch {
    // localStorage unavailable; silently skip.
  }
}

function applySpeed(mult: number | 'pause'): void {
  if (mult === 'pause') {
    session.pause();
  } else {
    session.setSpeed(mult);
    if (!session.running) session.resume();
  }
}

function pick(mult: number | 'pause'): void {
  active.value = mult;
  writeSaved(mult);
  applySpeed(mult);
}

onMounted(() => {
  const saved = readSaved();
  const valid = saved !== null && CHOICES.some((c) => c.mult === saved);
  const initial: number | 'pause' = valid ? (saved as number | 'pause') : 1;
  active.value = initial;
  if (saved !== null && !valid) writeSaved(1);
  applySpeed(initial);
});
</script>

<template>
  <div role="radiogroup" aria-label="Simulation speed" class="speed-picker">
    <button
      v-for="choice in CHOICES"
      :key="String(choice.mult)"
      type="button"
      role="radio"
      :aria-label="choice.ariaLabel"
      :aria-pressed="String(active === choice.mult)"
      :class="{ active: active === choice.mult }"
      @click="pick(choice.mult)"
    >
      {{ choice.label }}
    </button>
  </div>
</template>

<style scoped>
.speed-picker {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.speed-picker button {
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
  background: transparent;
  color: inherit;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  opacity: 0.75;
  cursor: pointer;
}

.speed-picker button:hover {
  background: #e2e8f0;
  opacity: 1;
}

.speed-picker button.active {
  background: #475569;
  color: #fff;
  border-color: #475569;
  opacity: 1;
}
</style>
