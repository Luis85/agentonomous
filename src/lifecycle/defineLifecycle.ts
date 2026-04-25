import type { LifeStageSchedule, LifeStageScheduleEntry } from './LifeStageSchedule.js';
import type { StageCapabilityMap } from './StageCapabilities.js';

/**
 * Data-driven lifecycle descriptor. JSON-editable so content designers
 * can tune species aging without touching TS:
 *
 * ```ts
 * export const catLifecycle = defineLifecycle({
 *   schedule: [
 *     { stage: 'kitten', atSeconds: 0 },
 *     { stage: 'adult',  atSeconds: 120 },
 *     { stage: 'elder',  atSeconds: 600 },
 *   ],
 *   capabilities: {
 *     kitten: { deny: ['trade', 'scold-others'] },
 *   },
 * });
 * ```
 */
export type LifecycleTemplate = {
  schedule: LifeStageSchedule;
  capabilities?: StageCapabilityMap;
};

export type LifecycleDescriptor = {
  schedule: LifeStageSchedule;
  capabilities?: StageCapabilityMap;
};

export function defineLifecycle(template: LifecycleTemplate): LifecycleDescriptor {
  const schedule: readonly LifeStageScheduleEntry[] = [...template.schedule].sort(
    (a, b) => a.atSeconds - b.atSeconds,
  );
  return {
    schedule,
    ...(template.capabilities !== undefined ? { capabilities: template.capabilities } : {}),
  };
}
