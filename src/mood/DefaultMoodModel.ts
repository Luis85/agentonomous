import type { Mood, MoodCategory } from './Mood.js';
import type { MoodEvaluationContext, MoodModel } from './MoodModel.js';

/**
 * Rule-based default mood model. Shipped so consumers get expressive pets
 * out of the box without writing mood logic themselves.
 *
 * Algorithm (deterministic):
 * 1. Compute `avgUrgency` across all needs (sum / count).
 * 2. If any need has `urgency > 0.85` → 'sick' or 'sad' (depending on persona).
 * 3. Else if `avgUrgency > 0.6` → 'sad'.
 * 4. Else if `avgUrgency > 0.3` → 'bored'.
 * 5. Else → 'happy' (or 'playful' if persona.traits.playfulness > 0.6).
 * 6. Modifier mood biases add; highest-biased category wins if it beats
 *    the rule-based pick by > 0.1.
 */
export class DefaultMoodModel implements MoodModel {
  evaluate(ctx: MoodEvaluationContext): Mood {
    const avgUrgency = computeAvgUrgency(ctx);
    const basePick = pickBaseCategory(avgUrgency, ctx);

    const biased = applyModifierBias(basePick, ctx);
    const valence = 1 - avgUrgency;

    // Preserve updatedAt if category didn't change (important for event emission).
    if (ctx.previous && ctx.previous.category === biased) {
      return { category: biased, updatedAt: ctx.previous.updatedAt, valence };
    }
    return { category: biased, updatedAt: ctx.wallNowMs, valence };
  }
}

function computeAvgUrgency(ctx: MoodEvaluationContext): number {
  const needs = ctx.needs;
  if (!needs) return 0;
  const list = needs.list();
  if (list.length === 0) return 0;
  let sum = 0;
  for (const need of list) sum += needs.urgency(need.id);
  return sum / list.length;
}

function pickBaseCategory(avg: number, ctx: MoodEvaluationContext): MoodCategory {
  if (ctx.needs) {
    for (const need of ctx.needs.list()) {
      if (ctx.needs.urgency(need.id) > 0.85) {
        return need.id === 'health' ? 'sick' : 'sad';
      }
    }
  }
  if (avg > 0.6) return 'sad';
  if (avg > 0.3) return 'bored';
  const playfulness = ctx.persona?.traits.playfulness ?? 0;
  return playfulness > 0.6 ? 'playful' : 'happy';
}

function applyModifierBias(base: MoodCategory, ctx: MoodEvaluationContext): MoodCategory {
  const candidates: readonly MoodCategory[] = [
    'happy',
    'content',
    'sad',
    'angry',
    'scared',
    'bored',
    'sick',
    'playful',
    'sleepy',
  ];
  let winning = base;
  let winningBias = 0;
  for (const category of candidates) {
    const bias = ctx.modifiers.moodBias(category);
    if (bias > winningBias + 0.1) {
      winning = category;
      winningBias = bias;
    }
  }
  return winning;
}
