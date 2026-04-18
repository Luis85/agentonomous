/**
 * Life stage of an agent. Common values are typed; consumer species can
 * introduce their own stage names via the escape hatch.
 *
 * `'deceased'` is special: once an agent transitions here its `tick()`
 * short-circuits and the trace carries `halted: true`.
 */
export type LifeStage =
  | 'egg'
  | 'baby'
  | 'child'
  | 'teen'
  | 'adult'
  | 'elder'
  | 'deceased'
  | (string & {});

export const DECEASED_STAGE: LifeStage = 'deceased';
