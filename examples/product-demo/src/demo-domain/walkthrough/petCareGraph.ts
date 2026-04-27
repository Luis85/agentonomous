/**
 * Composed walkthrough graph for the pet-care scenario.
 *
 * Slice 1.2b ships chapter 1 only. Slices 1.3 / 1.4 fan the array
 * out to chapters 2-5; the graph builder validates the combined
 * step-id uniqueness + `nextOnComplete` reachability at build time,
 * so adding a chapter is "import + concat" — no runtime hooks here.
 *
 * Rebuilding the graph is cheap (validation runs once on a small
 * frozen array) but the result is exported as a constant so view
 * stores can hold a stable reference without re-validating per
 * subscription.
 */

import { defineWalkthroughGraph } from './graph.js';
import type { WalkthroughGraph } from './graph.js';
import { chapter1Steps } from './chapters/1.js';
import { chapter2Steps } from './chapters/2.js';
import { chapter3Steps } from './chapters/3.js';
import { chapter4Steps } from './chapters/4.js';
import { chapter5Steps } from './chapters/5.js';

export const petCareWalkthroughGraph: WalkthroughGraph = defineWalkthroughGraph([
  ...chapter1Steps,
  ...chapter2Steps,
  ...chapter3Steps,
  ...chapter4Steps,
  ...chapter5Steps,
]);
