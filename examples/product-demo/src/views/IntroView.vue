<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useTourProgress } from '../stores/view/useTourProgress.js';

const router = useRouter();
const tour = useTourProgress();

const ctaLabel = computed(() => {
  if (tour.completedAt !== null) return 'Replay the tour';
  return 'Start guided tour';
});

function startTour(): void {
  if (tour.completedAt !== null) tour.restart();
  void router.push('/play');
}

function skipTour(): void {
  // Mark the tour skipped so the overlay does not pop on /play.
  tour.restart();
  tour.skip();
  void router.push('/play');
}
</script>

<template>
  <section class="intro-view">
    <h1>Meet Whiskers</h1>
    <p class="intro-view__lede">
      A small autonomous pet running on the agentonomous engine. The walkthrough below shows how it
      picks its own actions, how each decision gets made, and how every run is byte-identical given
      the same seed.
    </p>
    <div class="intro-view__ctas">
      <button type="button" class="intro-view__primary" @click="startTour">
        {{ ctaLabel }}
      </button>
      <button type="button" class="intro-view__secondary" @click="skipTour">
        Skip to free play
      </button>
    </div>
  </section>
</template>

<style scoped>
.intro-view {
  max-width: 640px;
  margin: 48px auto;
  padding: 0 16px;
  text-align: center;
}

.intro-view h1 {
  font-size: 32px;
  margin: 0 0 12px;
}

.intro-view__lede {
  font-size: 16px;
  line-height: 1.5;
  opacity: 0.8;
  margin: 0 0 24px;
}

.intro-view__ctas {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.intro-view__primary,
.intro-view__secondary {
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.intro-view__primary {
  background: #4f46e5;
  color: #fff;
}

.intro-view__primary:hover {
  background: #4338ca;
}

.intro-view__secondary {
  background: transparent;
  color: inherit;
  border: 1px solid currentColor;
  opacity: 0.8;
}

.intro-view__secondary:hover {
  opacity: 1;
}
</style>
