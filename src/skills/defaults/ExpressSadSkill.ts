import { createExpressionSkill } from './ExpressionSkill.js';

/**
 * Expressive reaction: emits a "sad" expression event for renderers to show
 * a glum beat. Does not mutate needs or modifiers.
 */
export const ExpressSadSkill = createExpressionSkill('express:sad', 'Sad', 'sad', 'sad-cloud');
