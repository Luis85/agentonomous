<script setup lang="ts">
import { computed, getCurrentInstance, ref } from 'vue';
import type { AgentSnapshot } from 'agentonomous';
import { useAgentSession } from '../../stores/domain/useAgentSession.js';
import { useRegisterSelector } from '../../composables/useRegisterSelector.js';

const session = useAgentSession();
useRegisterSelector('export.button');
useRegisterSelector('import.button');
// Same template-ref workaround as `<HudPanel>` — Vue Test Utils +
// plugin-vue 6 production transform hoists template refs and the
// binding warning fires. Look up the file input lazily via the root
// element instead.
const instance = getCurrentInstance();
function getFileInput(): HTMLInputElement | null {
  const root = instance?.proxy?.$el as HTMLElement | undefined;
  return root?.querySelector?.<HTMLInputElement>('input[type="file"]') ?? null;
}
const error = ref<string | null>(null);

const petName = computed(() => session.agent?.identity.name ?? session.agent?.identity.id ?? 'pet');
const petId = computed(() => session.agent?.identity.id ?? 'pet');

function exportSnapshot(): void {
  const agent = session.agent;
  if (agent === null) return;
  let url: string | null = null;
  try {
    const snap = agent.snapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement('a');
    anchor.href = url;
    anchor.download = `${petId.value}.json`;
    globalThis.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Tour-aware UI signal — chapter-5 step "replay-export" advances on this.
    session.recordUiEvent('SnapshotExported');
  } catch (err) {
    error.value = `Export failed: ${(err as Error).message}`;
  } finally {
    if (url !== null) URL.revokeObjectURL(url);
  }
}

function triggerImport(): void {
  getFileInput()?.click();
}

function handleFile(): void {
  const input = getFileInput();
  if (input === null) return;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === 'string' ? reader.result : '';
    input.value = '';
    try {
      const parsed = JSON.parse(text) as AgentSnapshot;
      void session
        .replayFromSnapshot(parsed)
        .then(() => {
          // Recorded AFTER the rebuild so the event lands in the fresh
          // `recentEvents` buffer (replay clears the previous one).
          // Chapter-5 step "replay-import" advances on this signal.
          session.recordUiEvent('SnapshotImported');
        })
        .catch((err: Error) => {
          error.value = `Import failed: ${err.message}`;
        });
      error.value = null;
    } catch (err) {
      error.value = `Import failed: ${(err as Error).message}`;
    }
  };
  reader.onerror = () => {
    error.value = 'Import failed: could not read file.';
  };
  reader.readAsText(file);
}
</script>

<template>
  <div class="export-import">
    <button
      type="button"
      class="io-button"
      data-tour-handle="export.button"
      :aria-label="`Export ${petName}`"
      @click="exportSnapshot"
    >
      💾 Export
    </button>
    <button
      type="button"
      class="io-button"
      data-tour-handle="import.button"
      :aria-label="`Import a saved ${petName}`"
      @click="triggerImport"
    >
      📂 Import
    </button>
    <input type="file" accept="application/json,.json" hidden @change="handleFile" />
    <p v-if="error !== null" role="alert" class="export-import__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.export-import {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.io-button {
  padding: 6px 10px;
  font-size: 13px;
  background: #64748b;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.io-button:hover {
  background: #475569;
}

.export-import__error {
  margin: 0;
  color: #dc2626;
  font-size: 12px;
  flex-basis: 100%;
}
</style>
