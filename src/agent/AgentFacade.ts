import type { DomainEvent } from '../events/DomainEvent.js';
import type { Rng } from '../ports/Rng.js';
import type { WallClock } from '../ports/WallClock.js';
import type { Logger } from '../ports/Logger.js';
import type { AgentIdentity } from './AgentIdentity.js';

/**
 * Read-only + safe-mutation surface passed to skills, reactive handlers,
 * and modules. Keeps consumers from mutating agent internals in ways that
 * break invariants (e.g., setting need levels directly without going
 * through the `satisfy` verb).
 *
 * More verbs land in later milestones:
 *   - M3: `satisfyNeed(id, amount)`
 *   - M4: `applyModifier(mod)` / `removeModifier(id)`
 *   - M10: `addMemory(record)`
 *
 * For M2 it exposes only the immutable read surface + `publishEvent`.
 */
export interface AgentFacade {
  readonly identity: AgentIdentity;
  readonly clock: WallClock;
  readonly rng: Rng;
  readonly logger: Logger;

  /** Publish a `DomainEvent` onto the shared bus. */
  publishEvent(event: DomainEvent): void;

  /**
   * Invoke a registered skill by id. Used primarily by module reactive
   * handlers (e.g., routing `InteractionRequested` events to the matching
   * skill). Fires `SkillCompleted` / `SkillFailed` on the bus like any
   * in-tick skill execution.
   */
  invokeSkill(skillId: string, params?: Record<string, unknown>): Promise<void>;

  /**
   * Current wall-to-virtual time multiplier. `0` means paused. Read-only
   * on the facade; use `Agent.setTimeScale(scale)` at the harness layer to
   * change it. A reactive handler that wants to defer work during pause
   * can check `facade.getTimeScale() === 0` without reaching past the
   * facade boundary.
   */
  getTimeScale(): number;
}
