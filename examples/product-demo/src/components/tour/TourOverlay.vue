<script setup lang="ts">
import { computed, watch } from 'vue';
import { useAgentSession } from '../../stores/domain/useAgentSession.js';
import { useTourProgress } from '../../stores/view/useTourProgress.js';
import StepHighlight from './StepHighlight.vue';

const session = useAgentSession();
const tour = useTourProgress();

const step = computed(() => tour.currentStep);

// Re-evaluate the active step's predicate on every tick. The predicate
// is pure + cheap, so polling per tick is the simplest correct shape;
// once chapter-2 lands (slice 1.3) we can switch to a debounced
// `watchEffect` if measurement shows it matters.
watch(
  () => session.tickIndex,
  () => {
    tour.next();
  },
);
</script>

<template>
  <div v-if="step !== null" class="tour-overlay" role="region" aria-live="polite">
    <StepHighlight :handle="step.highlight" />
    <div class="tour-overlay__card">
      <div class="tour-overlay__chapter">Chapter {{ step.chapter }}</div>
      <h3 class="tour-overlay__title">{{ step.title }}</h3>
      <p class="tour-overlay__hint">{{ step.hint }}</p>
      <div class="tour-overlay__actions">
        <button type="button" class="tour-overlay__skip" @click="tour.skip">Skip</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tour-overlay {
  pointer-events: none;
}

.tour-overlay__card {
  position: fixed;
  bottom: 24px;
  right: 24px;
  max-width: 320px;
  background: #1f2937;
  color: #f8fafc;
  border-radius: 12px;
  padding: 16px 20px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.45);
  pointer-events: auto;
  z-index: 9999;
}

.tour-overlay__chapter {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.6;
  margin-bottom: 4px;
}

.tour-overlay__title {
  margin: 0 0 6px;
  font-size: 16px;
}

.tour-overlay__hint {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.4;
}

.tour-overlay__actions {
  display: flex;
  justify-content: flex-end;
}

.tour-overlay__skip {
  background: transparent;
  color: inherit;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.tour-overlay__skip:hover {
  background: rgba(255, 255, 255, 0.08);
}
</style>
