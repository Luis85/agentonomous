/**
 * A single homeostatic need. Levels are in `[0, 1]`:
 *   - `1.0` = fully satisfied
 *   - `0.0` = completely depleted (often fatal — see `health`).
 *
 * `decayPerSec` is in units-per-virtual-second. The `Modifiers` system
 * (M4) scales this at tick time via `modifiers.decayMultiplier(id)`.
 *
 * `urgencyCurve` maps the current level to an urgency score in `[0, 1]`
 * that the `Reasoner` feeds into candidate scoring. The default curve is
 * `1 - level` — linear urgency as the need depletes.
 */
export interface Need {
  id: string;
  /** Current level in [0, 1]. Clamped by `Needs` on mutation. */
  level: number;
  /** Rate at which this need depletes per virtual second. */
  decayPerSec: number;
  /** Optional custom urgency curve; defaults to `1 - level`. */
  urgencyCurve?: (level: number) => number;
  /**
   * Level below which the need is considered critical. Crossing the
   * threshold downward emits `NeedCritical`; crossing it back up emits
   * `NeedSafe`. Undefined = never emits critical.
   */
  criticalThreshold?: number;
}

/** Result of a single Needs.tick() / satisfy() call for one need. */
export interface NeedsDelta {
  needId: string;
  before: number;
  after: number;
  /** True if the level crossed `criticalThreshold` downward in this step. */
  crossedCritical: boolean;
  /** True if the level crossed `criticalThreshold` upward in this step. */
  crossedSafe: boolean;
}

export const DEFAULT_URGENCY_CURVE = (level: number): number => 1 - clamp01(level);

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export { clamp01 };
