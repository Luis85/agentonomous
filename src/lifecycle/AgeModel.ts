import { DECEASED_STAGE, type LifeStage } from './LifeStage.js';
import type { LifeStageSchedule } from './LifeStageSchedule.js';

/** Result of a single AgeModel.advance() call. */
export interface LifeStageTransition {
  from: LifeStage;
  to: LifeStage;
  atAgeSeconds: number;
}

/** Construction options for AgeModel. */
export interface AgeModelOptions {
  /** Wall-clock ms at which the agent was born. Used for snapshot rebinding. */
  bornAt: number;
  /** Ordered schedule of age → stage transitions. */
  schedule: LifeStageSchedule;
  /** Current virtual age in seconds. Defaults to 0. */
  initialAgeSeconds?: number;
  /** Current life stage. Defaults to the first schedule entry (or 'egg'). */
  initialStage?: LifeStage;
}

/**
 * Tracks an agent's virtual age and advances its life stage on thresholds.
 *
 * `advance(virtualDtSeconds)` is catch-up-aware: if the delta spans multiple
 * stage thresholds (for instance after restoring from a snapshot saved hours
 * ago), every crossed transition is reported in order so downstream emitters
 * can fire all intermediate `LifeStageChanged` events.
 */
export class AgeModel {
  readonly bornAt: number;
  readonly schedule: LifeStageSchedule;
  private _ageSeconds: number;
  private _stage: LifeStage;

  constructor(opts: AgeModelOptions) {
    this.bornAt = opts.bornAt;
    this.schedule = opts.schedule;
    this._ageSeconds = opts.initialAgeSeconds ?? 0;
    const firstStage = opts.schedule[0]?.stage ?? 'egg';
    this._stage = opts.initialStage ?? firstStage;
  }

  get ageSeconds(): number {
    return this._ageSeconds;
  }

  get stage(): LifeStage {
    return this._stage;
  }

  /**
   * Advance age by `virtualDtSeconds`. Returns every schedule transition the
   * age crossed during this advance (zero or more, ordered by threshold).
   * No-op if the agent is already `'deceased'`.
   */
  advance(virtualDtSeconds: number): readonly LifeStageTransition[] {
    if (this._stage === DECEASED_STAGE || virtualDtSeconds <= 0) return [];
    const before = this._ageSeconds;
    const after = before + virtualDtSeconds;
    this._ageSeconds = after;

    const transitions: LifeStageTransition[] = [];
    for (const entry of this.schedule) {
      if (entry.stage === DECEASED_STAGE) continue; // death isn't schedulable
      if (entry.atSeconds > before && entry.atSeconds <= after && entry.stage !== this._stage) {
        const from = this._stage;
        this._stage = entry.stage;
        transitions.push({ from, to: entry.stage, atAgeSeconds: entry.atSeconds });
      }
    }
    return transitions;
  }

  /** Force the agent into `'deceased'`. Returns the transition if it changed. */
  markDeceased(): LifeStageTransition | null {
    if (this._stage === DECEASED_STAGE) return null;
    const from = this._stage;
    this._stage = DECEASED_STAGE;
    return { from, to: DECEASED_STAGE, atAgeSeconds: this._ageSeconds };
  }

  /** Snapshot the mutable state slice (for AgentSnapshot in M10). */
  snapshot(): { bornAt: number; ageSeconds: number; stage: LifeStage } {
    return { bornAt: this.bornAt, ageSeconds: this._ageSeconds, stage: this._stage };
  }

  /** Restore from a snapshot. */
  restore(state: { ageSeconds: number; stage: LifeStage }): void {
    this._ageSeconds = state.ageSeconds;
    this._stage = state.stage;
  }
}
