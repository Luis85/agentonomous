/**
 * Shared demo-level constants. Extracted so the HUD (`ui.ts`) and the
 * decision-trace inspector (`traceView.ts`) show the same needs in the
 * same order without drift.
 */
export const NEEDS: readonly { id: string; label: string }[] = [
  { id: 'hunger', label: 'Hunger' },
  { id: 'cleanliness', label: 'Cleanliness' },
  { id: 'happiness', label: 'Happiness' },
  { id: 'energy', label: 'Energy' },
  { id: 'health', label: 'Health' },
];
