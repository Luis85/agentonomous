import type { Modifier, ModifierStackPolicy } from './Modifier.js';
import type { ModifierEffect } from './ModifierEffect.js';

/**
 * Data-driven factory for modifier templates. Consumers describe a buff/debuff
 * as a plain object (JSON-editable), and `defineModifier` stamps out concrete
 * `Modifier` instances at application time with `appliedAt` and optional
 * `expiresAt` filled in.
 *
 * Useful for content catalogs:
 *
 * ```ts
 * export const wellFed = defineModifier({
 *   id: 'well-fed',
 *   source: 'skill:feed',
 *   durationSeconds: 120,
 *   stack: 'refresh',
 *   effects: [
 *     { target: { type: 'need-decay', needId: 'hunger' }, kind: 'multiply', value: 0.5 },
 *   ],
 *   visual: { hudIcon: 'icon-wellfed', fxHint: 'sparkle-green' },
 * });
 * // Later:
 * agent.applyModifier(wellFed.instantiate(clock.now()));
 * ```
 */
export type ModifierTemplate = {
  id: string;
  source: string;
  stack: ModifierStackPolicy;
  effects: readonly ModifierEffect[];
  visual?: Modifier['visual'];
  /** If set, the modifier expires `durationSeconds` after application. */
  durationSeconds?: number;
};

export type ModifierBlueprint = ModifierTemplate & {
  /**
   * Stamp out a concrete `Modifier` with `appliedAt = at` and
   * `expiresAt = at + durationSeconds * 1000` when `durationSeconds` is set.
   */
  instantiate(at: number, overrides?: Partial<Modifier>): Modifier;
};

export function defineModifier(template: ModifierTemplate): ModifierBlueprint {
  return {
    ...template,
    instantiate(at: number, overrides: Partial<Modifier> = {}): Modifier {
      const base: Modifier = {
        id: template.id,
        source: template.source,
        appliedAt: at,
        stack: template.stack,
        effects: template.effects,
        ...(template.visual !== undefined ? { visual: template.visual } : {}),
        ...(template.durationSeconds !== undefined
          ? { expiresAt: at + template.durationSeconds * 1000 }
          : {}),
      };
      return { ...base, ...overrides };
    },
  };
}
