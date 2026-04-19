/**
 * Opt-in schema validation port. Consumers who want input validation on
 * skills/tools plug in a validator backed by zod, valibot, ajv, or whatever
 * they prefer — the core library stays dependency-free.
 *
 * `ValidationResult` mirrors the shape of `Result<T, E>` but is defined here
 * so this port has no dependencies on anything else in the library.
 */
export interface Validator {
  /**
   * Validate `input` against `schema`. `schema` is intentionally typed as
   * `unknown` — each adapter knows how to interpret its own schema dialect.
   */
  validate<T = unknown>(schema: unknown, input: unknown): ValidationResult<T>;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: readonly ValidationIssue[] };

export interface ValidationIssue {
  path: readonly (string | number)[];
  message: string;
  code?: string;
}

/**
 * No-op validator: accepts every input unchanged. Intended as a no-op /
 * testing utility and the zero-config default when no `Validator` is wired
 * into `createAgent`. Production consumers typically inject a zod-,
 * valibot-, or ajv-backed implementation that actually enforces the
 * schema contract on skill parameters, tool inputs, and remote commands.
 */
export class PassthroughValidator implements Validator {
  validate<T = unknown>(_schema: unknown, input: unknown): ValidationResult<T> {
    return { ok: true, value: input as T };
  }
}
