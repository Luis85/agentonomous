/**
 * Minimal inline `Result<T, E>` type. Used for expected domain failures
 * (inventory overflow, wallet overdraft, etc.) — infrastructure failures
 * still throw typed `AgentError` subclasses.
 *
 * No external dependency; ~30 lines of helpers covers the cases the
 * library actually hits.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Narrows a `Result<T, E>` to its `Ok<T>` branch. */
export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

/** Narrows a `Result<T, E>` to its `Err<E>` branch. */
export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}

/** Runs `fn` on the success value if any; passes through `Err` unchanged. */
export function map<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** Runs `fn` on the error value if any; passes through `Ok` unchanged. */
export function mapErr<T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error));
}

/** Chains another `Result`-returning fn on the success value; short-circuits on `Err`. */
export function andThen<T, U, E>(r: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return r.ok ? fn(r.value) : r;
}

/**
 * Returns the `Ok` value or throws on `Err`. Use only in tests / boundaries
 * where failure is unrecoverable.
 */
export function unwrap<T, E>(r: Result<T, E>, message?: string): T {
  if (r.ok) return r.value;
  throw new Error(message ?? `Called unwrap() on an Err: ${String(r.error)}`);
}
