import type { ModifierEffect } from './ModifierEffect.js';

/**
 * Stack semantics when applying a modifier whose id already exists:
 *
 * - `replace` — remove the existing instance, then add the new one.
 * - `stack`   — keep both; effects compose as usual.
 * - `refresh` — update the existing instance's `expiresAt` + `effects`
 *               without spawning a new entry.
 * - `ignore`  — drop the new apply; the existing instance wins.
 */
export type ModifierStackPolicy = 'replace' | 'stack' | 'refresh' | 'ignore';

/**
 * A buff or debuff applied to an agent. Time-bound or permanent; carries
 * visual hints for HUD icons and FX.
 *
 * Canonical sources (string conventions):
 *   - `'skill:<skillId>'`
 *   - `'event:<eventType>'`
 *   - `'stage:<lifeStage>'`
 *   - `'interaction:<verb>'`
 *   - `'trait:<traitId>'`
 */
export interface Modifier {
  /** Identifier (stable across restarts; used for stack policy matching). */
  id: string;
  /** Source string — debugging and trace inspection. */
  source: string;
  /** Wall-clock ms when this modifier was applied. */
  appliedAt: number;
  /**
   * Wall-clock ms at which this modifier expires automatically.
   * Undefined = permanent until removed.
   */
  expiresAt?: number;
  /** Stack policy when applying a second instance with the same id. */
  stack: ModifierStackPolicy;
  /** The numerical effects this modifier contributes. */
  effects: readonly ModifierEffect[];
  /**
   * Optional visual hints for renderers. `label` is a human-readable
   * display name — renderers should prefer it over the raw `id` when
   * present. The other fields are opaque hints consumed by whichever
   * rendering layer the host app wires up.
   */
  visual?: {
    label?: string;
    hudIcon?: string;
    overlay?: string;
    fxHint?: string;
  };
}
