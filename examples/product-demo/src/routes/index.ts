import { createRouter, createWebHistory, type RouteRecordRaw, type Router } from 'vue-router';
import IntroView from '../views/IntroView.vue';
import PlayView from '../views/PlayView.vue';

/**
 * Pre-v1 demo route map (Pillar 1, slice 1.2a — scaffold only). The Vue
 * shell is type-checked and unit-importable from this slice but is not
 * the live entry yet; the Wave-0 bridge in `app/main.ts` keeps booting
 * the legacy demo until slice 1.2b swaps the mount.
 *
 * `:scenarioId?` reserves the multi-scenario routing surface used by
 * Pillar 4. The diff / replay / tour routes follow the design doc's
 * cross-pillar contracts table; their dedicated views land alongside
 * the slices that own each contract.
 */
export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'intro', component: IntroView },
  { path: '/play', name: 'play', component: PlayView },
  { path: '/play/:scenarioId', name: 'play-scenario', component: PlayView, props: true },
  { path: '/tour/:step?', name: 'tour', component: PlayView, props: true },
  { path: '/diff', name: 'diff', component: PlayView },
  { path: '/replay', name: 'replay', component: PlayView },
];

/**
 * Build the demo's router instance. Live wiring (the `app.use(router)`
 * call alongside `createApp(App)`) lands in slice 1.2b once the
 * chapter-1 vertical exists for users to land on.
 */
export function createAppRouter(base = '/'): Router {
  return createRouter({
    history: createWebHistory(base),
    routes,
  });
}
