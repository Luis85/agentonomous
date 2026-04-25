/**
 * Port through which the library reaches an LLM provider. v1.0 ships the
 * completion-only surface: messages in, one completion out, no streaming,
 * no tool-use, no structured output. Streaming + tool-use additions land
 * in Phase B and are additive — nothing here has to change.
 *
 * Consumers pick a concrete adapter (e.g. `AnthropicLlmProvider`,
 * `OpenAiLlmProvider`; both Phase B) or implement their own. Tests use
 * `MockLlmProvider` from this module for deterministic playback.
 */

/** Role tag for a single turn. The provider decides how to serialise these. */
export type LlmRole = 'system' | 'user' | 'assistant';

/**
 * Request-side hint that a provider MAY honour to insert a prompt-cache
 * breakpoint at this message boundary. The concrete meaning is up to the
 * adapter (Anthropic: `cache_control: ephemeral`; OpenAI: prompt-caching;
 * in-memory mock: response memoisation). Opaque to the core — consumers
 * supply an arbitrary stable string; the adapter translates.
 */
export type LlmCacheHint = {
  /** Stable logical key the provider may use to group cache lookups. */
  readonly key: string;
};

/** A single message in a completion request. */
export type LlmMessage = {
  readonly role: LlmRole;
  readonly content: string;
  /** If present, signals a cache breakpoint after this message. */
  readonly cacheHint?: LlmCacheHint;
};

/**
 * Upper bounds a consumer wants enforced per request. Adapters throw
 * `BudgetExceededError` (from `src/agent/errors.ts`) before calling the
 * upstream provider when any populated limit would be exceeded. All
 * fields optional: absence means "no cap".
 */
export type LlmBudget = {
  /** Hard ceiling on tokens the provider may generate. */
  readonly maxOutputTokens?: number;
  /** Hard ceiling on input tokens (rough estimate is acceptable). */
  readonly maxInputTokens?: number;
  /** Hard ceiling on spend for this single request, in USD cents. */
  readonly maxCostCents?: number;
};

/** Per-call knobs. All fields optional; adapter defaults apply. */
export type LlmCompleteOptions = {
  /** Specific model id (e.g. `claude-opus-4-7`). Adapter picks a default. */
  readonly model?: string;
  /** Per-request budget caps. */
  readonly budget?: LlmBudget;
  /**
   * Sampling temperature. `0` = greedy (most deterministic). Adapters
   * MUST pass this through; determinism beyond `0` is provider-dependent.
   */
  readonly temperature?: number;
  /** Abort signal. Adapters should surface aborts as `stopReason: 'abort'`. */
  readonly signal?: AbortSignal;
};

/** Token + cost accounting for a single completion. */
export type LlmUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Total spend in USD cents, when the adapter can compute it. */
  readonly costCents?: number;
  /** True if the provider served (part of) the response from its cache. */
  readonly cached?: boolean;
};

/** One completion response. */
export type LlmCompletion = {
  /** Assistant text. Empty string is legal (e.g. tool-only turn in Phase B). */
  readonly text: string;
  /** Token + cost accounting. */
  readonly usage: LlmUsage;
  /** Model id that actually served the request. */
  readonly model: string;
  /**
   * Why generation stopped. `'stop'` = natural end; `'length'` = hit
   * `maxOutputTokens`; `'abort'` = `signal` fired. Adapters may surface
   * provider-specific strings (`'content_filter'`, …).
   */
  readonly stopReason?: 'stop' | 'length' | 'abort' | (string & {});
};

/**
 * Minimum LLM provider contract. v1.0 = completion only. Streaming,
 * tool-use, and structured output land in Phase B as additive methods
 * (likely `stream(...)` returning an async iterator) — existing
 * adapters keep working unchanged.
 */
export type LlmProviderPort = {
  complete(messages: readonly LlmMessage[], options?: LlmCompleteOptions): Promise<LlmCompletion>;
};
