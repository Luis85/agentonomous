import type { LifeStage } from './LifeStage.js';

/**
 * Entry in a `LifeStageSchedule`. Each entry declares that a stage starts
 * when `ageSeconds >= atSeconds` (in virtual time).
 *
 * Schedules are consumer-defined: a virtual cat might use
 * `[{stage:'egg',at:0}, {stage:'baby',at:30}, {stage:'adult',at:120},
 *   {stage:'elder',at:600}]` while a fish might only have egg/adult.
 *
 * `deceased` is **not** a schedulable stage — death is triggered by vitality
 * depletion or an explicit `agent.kill()` call.
 */
export interface LifeStageScheduleEntry {
  stage: LifeStage;
  atSeconds: number;
}

/** Ordered schedule of age → stage transitions. */
export type LifeStageSchedule = readonly LifeStageScheduleEntry[];
