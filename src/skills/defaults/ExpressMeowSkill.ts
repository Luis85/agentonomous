import { createExpressionSkill } from './ExpressionSkill.js';

/**
 * Expressive reaction: the agent emits a "meow" expression event that the
 * host can render as a speech bubble or sound effect. No need/mood mutation.
 */
export const ExpressMeowSkill = createExpressionSkill('express:meow', 'Meow', 'meow', 'sound-meow');
