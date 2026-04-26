<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppHeader from '../components/shell/AppHeader.vue';
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <main class="app-shell__main">
      <RouterView />
    </main>
  </div>
</template>
