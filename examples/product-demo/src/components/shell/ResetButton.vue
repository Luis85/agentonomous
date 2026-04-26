<script setup lang="ts">
import { computed } from 'vue';
import { useAgentSession } from '../../stores/domain/useAgentSession.js';

const session = useAgentSession();
const petName = computed(() => session.agent?.identity.name ?? session.agent?.identity.id ?? 'pet');

function reset(): void {
  const ok = globalThis.confirm?.(
    `Reset ${petName.value}? Lifetime stats and current state will be lost.`,
  );
  if (ok !== true) return;
  void session.replayFromSnapshot(null);
}
</script>

<template>
  <button type="button" class="reset-button" :aria-label="`Reset ${petName}`" @click="reset">
    🔄 Reset
  </button>
</template>

<style scoped>
.reset-button {
  padding: 6px 10px;
  font-size: 13px;
  background: #94a3b8;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.reset-button:hover {
  background: #64748b;
}
</style>
