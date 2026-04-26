<script setup lang="ts">
/**
 * Tour-route entry. A thin wrapper around `<PlayView>` that reconciles
 * the URL (`/tour/:step`) with `useTourProgress.lastStep` per spec
 * P1-FR-6. The simulation lives in `<PlayView>`; rendering it as a
 * child here keeps the tick loop + agent session shared with `/play`,
 * since `useAgentSession` is a Pinia store (not view-bound).
 *
 * Route-cursor reconciliation:
 *   - On mount, if the URL carries a known step id, fast-forward the
 *     cursor (forward-only) so a deep link survives the persisted
 *     progress check.
 *   - On every `tour.lastStep` change, push the URL so the address
 *     bar tracks the active step.
 */
import { onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTourProgress } from '../stores/view/useTourProgress.js';
import PlayView from './PlayView.vue';

const tour = useTourProgress();
const router = useRouter();
const route = useRoute();

onMounted(() => {
  const stepRaw = route.params['step'];
  if (typeof stepRaw === 'string' && stepRaw.length > 0) {
    tour.resumeFromRoute(stepRaw);
  }
  void tour.syncRoute(router);
});

watch(
  () => tour.lastStep,
  () => {
    void tour.syncRoute(router);
  },
);
</script>

<template>
  <PlayView />
</template>
