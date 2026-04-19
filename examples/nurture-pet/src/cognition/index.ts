import type { Reasoner } from 'agentonomous';

/**
 * Describes one cognition mode offered by the nurture-pet demo's
 * dropdown switcher.
 *
 * The registry is consumed by `cognitionSwitcher.ts` to render the
 * `<select>`, probe peer-dep availability at mount time, and construct
 * a fresh reasoner when the user changes selection. Each mode is
 * responsible for its own peer-dep probe (returns `true` iff a dynamic
 * `import()` of its peer resolves); `construct()` is only called after
 * a successful probe.
 */
export interface CognitionModeSpec {
  /** Stable id used as the `<option>` value. */
  readonly id: 'heuristic' | 'bt' | 'bdi' | 'learning';
  /** User-facing label for the dropdown. */
  readonly label: string;
  /**
   * npm package name of the peer dep the mode depends on. `null` for
   * the always-available heuristic mode (no peer). Used in the
   * disabled-option tooltip: `Install <peerName> to enable`.
   */
  readonly peerName: string | null;
  /**
   * Probes availability. For peer-dep modes, try/catches a dynamic
   * `import()` of the peer module. Returns `true` iff the import
   * resolves. Called once on mount; result is cached by the switcher.
   */
  probe(): Promise<boolean>;
  /**
   * Builds a fresh `Reasoner` instance for this mode. Returns a
   * Promise because peer-dep modes `await import(...)` their adapter
   * subpath inside `construct()` — the adapter module itself loads
   * the peer as a side effect, so the peer stays out of the main
   * bundle until a mode is selected. Called only after a successful
   * probe (either on the heuristic default at mount or on a
   * user-initiated `change` event). The switcher awaits the result
   * before handing it to `agent.setReasoner`.
   */
  construct(): Promise<Reasoner>;
}

// Modes are imported for their side effect of being discoverable here;
// the array literal below is the canonical registry + dropdown order.
import { heuristicMode } from './heuristic.js';
import { btMode } from './bt.js';
import { bdiMode } from './bdi.js';
import { learningMode } from './learning.js';

/** Registry ordered to match the dropdown display order. */
export const COGNITION_MODES: readonly CognitionModeSpec[] = [
  heuristicMode,
  btMode,
  bdiMode,
  learningMode,
];
