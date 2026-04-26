<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useAgentSession } from '../stores/domain/useAgentSession.js';
import HudPanel from '../components/shell/HudPanel.vue';
import SpeedPicker from '../components/shell/SpeedPicker.vue';
import ResetButton from '../components/shell/ResetButton.vue';
import ExportImportPanel from '../components/shell/ExportImportPanel.vue';
import TracePanel from '../components/trace/TracePanel.vue';
import TourOverlay from '../components/tour/TourOverlay.vue';

const SEED_PERSIST_KEY = 'demo.v2.session.lastSeed.petCare';

const session = useAgentSession();

let raf = 0;
let last = 0;
let stopped = false;

function readPersistedSeed(): string | null {
  try {
    const raw = globalThis.localStorage?.getItem(SEED_PERSIST_KEY);
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Generate a fresh seed string. Non-determinism is intentional here —
 * this is the one place a user explicitly asks for a new RNG stream —
 * so `Math.random` + `Date.now` are fair game (presentation layer is
 * not subject to NFR-D-1's domain-determinism rules).
 */
function generateSeed(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  const stamp = Date.now().toString(36).slice(-4);
  return `${rnd}-${stamp}`;
}

async function loop(now: number): Promise<void> {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  await session.tick(dt);
  if (stopped) return;
  raf = globalThis.requestAnimationFrame((t) => {
    void loop(t);
  });
}

// Initialize the agent session synchronously during setup so it runs
// before any child component's `onMounted`. Vue fires child mounted hooks
// before the parent's, so deferring `session.init` to the parent's
// `onMounted` would silently overwrite persisted controls (notably
// SpeedPicker's saved speed / pause) that children re-apply on their own
// mount.
const initialSeed = readPersistedSeed() ?? generateSeed();
session.init({ seed: initialSeed });

onMounted(() => {
  raf = globalThis.requestAnimationFrame((t) => {
    last = t;
    void loop(t);
  });
});

onBeforeUnmount(() => {
  stopped = true;
  if (raf !== 0) globalThis.cancelAnimationFrame(raf);
});
</script>

<template>
  <section class="play-view">
    <div class="play-view__main">
      <HudPanel />
    </div>
    <aside class="play-view__side">
      <div class="play-view__controls">
        <SpeedPicker />
        <ExportImportPanel />
        <ResetButton />
      </div>
      <TracePanel />
    </aside>
    <TourOverlay />
  </section>
</template>

<style scoped>
.play-view {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
  padding: 24px;
  min-height: calc(100vh - 56px);
}

@media (max-width: 960px) {
  .play-view {
    grid-template-columns: 1fr;
  }
}

.play-view__main {
  min-width: 0;
}

.play-view__side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.play-view__controls {
  background: var(--panel-bg, #fff);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
