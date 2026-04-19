import type { DomainEvent } from '../events/DomainEvent.js';
import type { AgentAction } from './AgentAction.js';
import type { ControlMode } from './ControlMode.js';

/**
 * Per-tick explainability record. Returned by `Agent.tick(dt)` and
 * intended to be cheap enough to keep for every tick during debugging.
 *
 * Downstream subsystems extend the optional `deltas` field:
 *   - M3 adds `needs`.
 *   - M4 adds `modifiers` (applied / expired).
 *   - M5 adds `stageTransitions` and `moodChanges`.
 *   - M7 adds `candidates` — the `IntentionCandidate[]` considered this
 *     tick when the control mode is autonomous (empty / omitted for
 *     remote / scripted modes). Ordering is stable under a fixed seed.
 *   - M8 adds `animationTransitions`.
 */
export interface DecisionTrace {
  agentId: string;

  /** Wall-clock ms when this tick started. */
  tickStartedAt: number;

  /** `dtSeconds * timeScale` — the amount of simulated time advanced this tick. */
  virtualDtSeconds: number;

  /** Control mode that actually ran this tick (autonomous / scripted / remote). */
  controlMode: ControlMode;

  /** Life stage at the end of the tick. `'alive'` placeholder until M5 lands real stages. */
  stage: string;

  /** True if the agent is deceased; the tick short-circuits and returns early. */
  halted: boolean;

  /** Events the agent perceived at the start of this tick. */
  perceived: readonly DomainEvent[];

  /** Actions the agent decided to take this tick. */
  actions: readonly AgentAction[];

  /** Events the agent emitted this tick. */
  emitted: readonly DomainEvent[];

  /** Reserved for subsystem-specific deltas (needs, modifiers, mood, ...). */
  deltas?: Record<string, unknown>;
}
