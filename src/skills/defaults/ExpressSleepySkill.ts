import { createExpressionSkill } from './ExpressionSkill.js';

/**
 * Expressive reaction: emits a "sleepy" expression event so the host can
 * play a yawn animation or similar. Does not mutate needs or modifiers.
 */
export const ExpressSleepySkill = createExpressionSkill(
  'express:sleepy',
  'Sleepy',
  'sleepy',
  'yawn',
);
