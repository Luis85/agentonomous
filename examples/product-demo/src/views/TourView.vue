<script setup lang="ts">
/**
 * Tour-route entry. A thin wrapper around `<PlayView>` that reconciles
 * the URL (`/tour/:step`) with `useTourProgress.lastStep` per spec
 * P1-FR-6. The simulation lives in `<PlayView>`; rendering it as a
 * child here keeps the tick loop + agent session shared with `/play`,
 * since `useAgentSession` is a Pinia store (not view-bound).
 *
 * Route-cursor reconciliation:
 *   - On mount AND on every `route.params.step` change, fast-forward
 *     the cursor (forward-only) so deep links + browser back/forward
 *     keep the URL and active step in sync. After resume, push the
 *     cursor's URL back so a no-op resume (URL upstream of cursor)
 *     re-anchors the address bar to the active step.
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

/**
 * Surface `router.push` rejections from `syncRoute` instead of swallowing
 * them with a bare `void`. A future navigation guard that blocks
 * `/tour/...` mid-session would otherwise silently fail — the URL
 * never updates, the chapter predicate never fires, and the tour
 * appears stuck with no console output during development.
 */
function logSyncRouteFailure(err: unknown): void {
  globalThis.console?.warn('[TourView] syncRoute failed:', err);
}

function reconcileFromRoute(): void {
  const stepRaw = route.params['step'];
  if (typeof stepRaw === 'string' && stepRaw.length > 0) {
    tour.resumeFromRoute(stepRaw);
  }
  tour.syncRoute(router).catch(logSyncRouteFailure);
}

onMounted(reconcileFromRoute);

watch(() => route.params['step'], reconcileFromRoute);

watch(
  () => tour.lastStep,
  () => {
    tour.syncRoute(router).catch(logSyncRouteFailure);
  },
);
</script>

<template>
  <PlayView />
</template>
