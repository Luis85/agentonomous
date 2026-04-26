/**
 * Categorical mood state. A handful of canonical values ship with the
 * library; consumer species can declare their own via the escape hatch
 * (`'curious'`, `'smug'`, etc.).
 */
export type MoodCategory =
  | 'happy'
  | 'content'
  | 'sad'
  | 'angry'
  | 'scared'
  | 'bored'
  | 'sick'
  | 'playful'
  | 'sleepy'
  | (string & {});

export type Mood = {
  category: MoodCategory;
  /** Wall-clock ms when the mood entered the current category. */
  updatedAt: number;
  /**
   * Optional numeric scalar in [-1, 1]. Positive = happy-valence. Not all
   * MoodModels set this — consumers who render smooth mood gradients use
   * it, categorical renderers ignore it.
   */
  valence?: number;
};
