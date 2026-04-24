---
'agentonomous': minor
---

Add the `LlmProviderPort` — the minimum contract v1.0 freezes so
Phase B can slot concrete adapters (`AnthropicLlmProvider`,
`OpenAiLlmProvider`) in without a breaking change. v1.0 surface is
intentionally small:

- `complete(messages, options) → Promise<LlmCompletion>` (no streaming,
  no tool-use, no structured output — all Phase B additions).
- `LlmMessage` with an optional `LlmCacheHint` so adapters that
  support prompt caching (Anthropic `cache_control: ephemeral`;
  OpenAI prompt caching) have a stable request-side hook.
- `LlmBudget` with input / output token caps + USD-cent spend cap;
  adapters throw the existing `BudgetExceededError` before calling
  upstream when a populated limit would be exceeded.
- `LlmUsage` reports `inputTokens`, `outputTokens`, optional
  `costCents`, optional `cached` flag.

Also ships `MockLlmProvider` — a deterministic, no-network playback
adapter with scripted responses, queue and `match-or-error`
dispatch modes, budget enforcement, and abort-signal handling. Use
it from tests + golden-trace replays so a `Reasoner` built on top
of an LLM still respects the library's byte-identical replay
contract.

No existing types changed. Core bundle is unaffected — the port +
mock are public-barrel additions only.
