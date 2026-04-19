/**
 * Centralized tuning constants for the shipped default models and skills.
 *
 * Every numeric value here used to live as a magic literal inside a specific
 * consumer (mood model, skill, needs policy, catch-up helper, persona bias).
 * Extracting them here makes it trivial to inspect, audit, or override the
 * defaults without patching the consumer files directly. Consumers retain
 * their constructor-style config options; this module simply sources the
 * default values.
 *
 * IMPORTANT: Changing a number here is a behavioral change for every
 * consumer that doesn't override it — treat these as tuning knobs, not
 * arbitrary constants.
 */

/**
 * Thresholds used by `DefaultMoodModel` to pick a base `MoodCategory` from
 * aggregated need urgencies, plus the minimum modifier-bias delta that can
 * override the rule-based pick.
 *
 * - `critical` (0.85): any single need above this flips mood to 'sick' (for
 *   the health need) or 'sad' — tipping point for a "something is wrong" read.
 * - `sad` (0.6): average urgency above this → 'sad'.
 * - `bored` (0.3): average urgency above this → 'bored'; below → 'happy'/'playful'.
 * - `playfulTraitCutoff` (0.6): persona.traits.playfulness above this picks
 *   'playful' over 'happy' when no need is pressing.
 * - `biasOverrideDelta` (0.1): a modifier mood-bias must beat the rule pick
 *   by more than this to win.
 */
export const MOOD_URGENCY_THRESHOLDS = {
  critical: 0.85,
  sad: 0.6,
  bored: 0.3,
  playfulTraitCutoff: 0.6,
  biasOverrideDelta: 0.1,
} as const;

/**
 * Per-trait weights applied by `defaultPersonaBias` when scaling intention
 * candidates. Each weight multiplies the matching trait value (0..1) to
 * produce the final additive bias passed to `UrgencyReasoner`.
 */
export const PERSONA_TRAIT_WEIGHTS = {
  /** Boost applied to `do-task` / `do-task:*` intentions per unit ambition. */
  ambition: 0.5,
  /** Boost applied to `react:greet` / `react:talk` intentions per unit sociability. */
  sociability: 0.4,
  /** Boost applied to `react:attack` / `satisfy-need:dominance` per unit aggression. */
  aggression: 0.5,
  /** Boost applied to `explore` / `investigate` intentions per unit curiosity. */
  curiosity: 0.4,
  /** Boost applied to any intention whose type contains 'play' per unit playfulness. */
  playfulness: 0.4,
} as const;

/**
 * Numeric defaults for the shipped default skills under `src/skills/defaults/`.
 * Keyed by skill id; each entry groups the magnitudes the skill applies to
 * needs / modifiers. Only skills with meaningful numeric literals appear;
 * the `express:*` reactions are state-less event emissions and are skipped.
 */
export const SKILL_DEFAULTS = {
  /** `feed`: raises hunger and attaches a `well-fed` modifier (60s, 0.5x decay). */
  feed: {
    hungerSatisfy: 0.6,
    wellFedDurationSeconds: 60,
    wellFedDecayMultiplier: 0.5,
  },
  /** `play`: raises happiness, costs a bit of energy, adds a 30s playful mood-bias. */
  play: {
    happinessSatisfy: 0.5,
    energyCost: 0.2,
    happyGlowDurationSeconds: 30,
    happyGlowMoodBias: 0.4,
  },
  /** `rest`: restores energy with a small hunger cost for the metabolic burn. */
  rest: {
    energySatisfy: 0.8,
    hungerCost: 0.1,
  },
  /** `clean`: raises cleanliness and strips the `dirty` debuff. */
  clean: {
    cleanlinessSatisfy: 0.7,
  },
  /** `pet`: a gentler `play` — small happiness bump + 30s `happy-glow`. */
  pet: {
    happinessSatisfy: 0.3,
    happyGlowDurationSeconds: 30,
    happyGlowMoodBias: 0.4,
  },
  /** `scold`: drains happiness and applies a 60s `scolded` sad-bias modifier. */
  scold: {
    happinessCost: 0.3,
    scoldedDurationSeconds: 60,
    scoldedMoodBias: 0.3,
  },
  /** `medicate`: on success raises health (requires the `sick` modifier). */
  medicate: {
    healthSatisfy: 0.4,
  },
} as const;

/**
 * Defaults for `runCatchUp` — fixed chunk size and hard cap used when
 * replaying a long offline period deterministically.
 */
export const OFFLINE_CATCHUP_DEFAULTS = {
  /** Fixed chunk size in virtual seconds. */
  chunkVirtualSeconds: 0.5,
  /** Hard cap on chunks processed per call. */
  maxChunks: 100_000,
} as const;

/**
 * Defaults for `ExpressiveNeedsPolicy` — the urgency floor below which no
 * expression fires (keeps the pet from meowing over trivial hunger).
 */
export const EXPRESSIVE_POLICY_DEFAULTS = {
  /** Minimum need urgency before an `express:*` intention is suggested. */
  minUrgency: 0.4,
} as const;
