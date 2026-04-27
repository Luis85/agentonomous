<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useSelectorRegistry } from '../../stores/view/useSelectorRegistry.js';
import type { RegisteredHandle } from '../../stores/view/selectorHandles.js';
import type { SelectorHandle } from '../../demo-domain/walkthrough/types.js';

const props = defineProps<{ handle: SelectorHandle }>();

const registry = useSelectorRegistry();
const rect = ref<{ top: number; left: number; width: number; height: number } | null>(null);
let raf = 0;

function recompute(): void {
  // Step `highlight` fields are constructed via `registeredHandle(...)`,
  // so the runtime value is always a `RegisteredHandle`. The cast keeps
  // the registry's typed surface honest without leaking the union into
  // the domain `WalkthroughStep` contract.
  const el = registry.resolve(props.handle as unknown as RegisteredHandle);
  if (el === null) {
    rect.value = null;
    return;
  }
  const box = el.getBoundingClientRect();
  rect.value = {
    top: box.top + globalThis.scrollY,
    left: box.left + globalThis.scrollX,
    width: box.width,
    height: box.height,
  };
}

function tick(): void {
  recompute();
  // The highlight tracks layout shifts (resize, scroll, content reflow)
  // by re-reading the bounding box on each animation frame. Cheap; a
  // single highlight is active at a time.
  raf = globalThis.requestAnimationFrame(tick);
}

onMounted(() => {
  recompute();
  raf = globalThis.requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  if (raf !== 0) globalThis.cancelAnimationFrame(raf);
});

const style = computed(() => {
  if (rect.value === null) return { display: 'none' };
  return {
    top: `${rect.value.top}px`,
    left: `${rect.value.left}px`,
    width: `${rect.value.width}px`,
    height: `${rect.value.height}px`,
  };
});
</script>

<template>
  <div class="step-highlight" :style="style" aria-hidden="true" />
</template>

<style scoped>
.step-highlight {
  position: absolute;
  pointer-events: none;
  border: 3px solid #facc15;
  border-radius: 12px;
  box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.35);
  transition:
    top 0.15s,
    left 0.15s,
    width 0.15s,
    height 0.15s;
  z-index: 9998;
}

@media (prefers-reduced-motion: reduce) {
  .step-highlight {
    transition: none;
  }
}
</style>
