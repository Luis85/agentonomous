/**
 * Composable accessor for the active scenario's walkthrough graph.
 *
 * View stores cannot take a runtime import on `demo-domain/**`
 * (eslint-enforced per design's DDD layering). The graph is shared
 * configuration that both the domain layer (predicates) and the view
 * layer (cursor + render) consume, so this composable wraps the
 * runtime import and gives the view layer a sanctioned entry point.
 *
 * Slice 1.2b ships pet-care only. Slice 1.3 / Pillar 4 (multi-scenario)
 * route through `useScenarioCatalog` to pick the right graph; this
 * helper grows a `scenarioId` arg at that point.
 */

import { petCareWalkthroughGraph } from '../demo-domain/walkthrough/petCareGraph.js';
import type { WalkthroughGraph } from '../demo-domain/walkthrough/graph.js';

export function useWalkthroughGraph(): WalkthroughGraph {
  return petCareWalkthroughGraph;
}
