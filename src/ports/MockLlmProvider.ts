import { BudgetExceededError } from '../agent/errors.js';
import type {
  LlmCompleteOptions,
  LlmCompletion,
  LlmMessage,
  LlmProviderPort,
  LlmUsage,
} from './LlmProviderPort.js';

/**
 * Scripted response used by `MockLlmProvider`. The `match` predicate
 * decides whether this entry fires for a given request; if omitted, the
 * script is matched only by position in the queue.
 */
export interface MockLlmScript {
  /** Optional predicate — if returns true, this script serves the request. */
  readonly match?: (messages: readonly LlmMessage[], options: LlmCompleteOptions) => boolean;
  /** Response text. */
  readonly text: string;
  /** Overrides for usage stats. Defaults to `ceil(content.length / 4)` per side. */
  readonly usage?: Partial<LlmUsage>;
  /** Model id reported in the completion. Defaults to the provider's `defaultModel`. */
  readonly model?: string;
  /** Stop reason reported. Defaults to `'stop'`. */
  readonly stopReason?: LlmCompletion['stopReason'];
}

/** Construction options for `MockLlmProvider`. */
export interface MockLlmProviderOptions {
  /** Ordered list of scripted responses. */
  readonly scripts: readonly MockLlmScript[];
  /**
   * Default model id surfaced when a script does not override it.
   * Defaults to `'mock-llm'`.
   */
  readonly defaultModel?: string;
  /**
   * How to dispatch to scripts:
   *  - `'queue'` (default): consume scripts in order; each request pops
   *    the next one (respecting optional `match`).
   *  - `'match-or-error'`: every request must find a script whose
   *    `match` returns true; no positional fallback.
   */
  readonly dispatch?: 'queue' | 'match-or-error';
}

/**
 * Deterministic `LlmProviderPort` for tests and golden-trace replays.
 *
 * No RNG, no `Date.now()`, no network. Two runs with identical options +
 * identical request sequences produce byte-identical completions —
 * matching the library's determinism contract, so a `Reasoner` built
 * on top of an LLM can still be replayed tick-for-tick.
 *
 * Budget enforcement is intentionally simple: the mock rejects any
 * request whose resulting completion would exceed a populated
 * `maxOutputTokens` or `maxCostCents`. `maxInputTokens` is checked
 * against the precomputed input estimate before the completion is
 * constructed.
 */
export class MockLlmProvider implements LlmProviderPort {
  private readonly scripts: readonly MockLlmScript[];
  private readonly defaultModel: string;
  private readonly dispatch: 'queue' | 'match-or-error';
  private cursor = 0;

  constructor(options: MockLlmProviderOptions) {
    this.scripts = options.scripts;
    this.defaultModel = options.defaultModel ?? 'mock-llm';
    this.dispatch = options.dispatch ?? 'queue';
  }

  complete(
    messages: readonly LlmMessage[],
    options: LlmCompleteOptions = {},
  ): Promise<LlmCompletion> {
    // Body returns a Promise so sync throws surface as rejected promises — the
    // port contract is async even though this mock has no real IO to await on.
    return Promise.resolve().then(() => this.completeSync(messages, options));
  }

  private completeSync(
    messages: readonly LlmMessage[],
    options: LlmCompleteOptions,
  ): LlmCompletion {
    if (options.signal?.aborted === true) {
      return {
        text: '',
        usage: { inputTokens: 0, outputTokens: 0 },
        model: options.model ?? this.defaultModel,
        stopReason: 'abort',
      };
    }

    const script = this.pickScript(messages, options);
    const model = script.model ?? options.model ?? this.defaultModel;
    const inputTokens = script.usage?.inputTokens ?? estimateTokens(messages);
    const outputTokens = script.usage?.outputTokens ?? estimateTokensFor(script.text);

    const budget = options.budget;
    if (budget?.maxInputTokens !== undefined && inputTokens > budget.maxInputTokens) {
      throw new BudgetExceededError(
        `MockLlmProvider: input ${inputTokens} tokens exceeds maxInputTokens ${budget.maxInputTokens}.`,
      );
    }
    if (budget?.maxOutputTokens !== undefined && outputTokens > budget.maxOutputTokens) {
      throw new BudgetExceededError(
        `MockLlmProvider: output ${outputTokens} tokens exceeds maxOutputTokens ${budget.maxOutputTokens}.`,
      );
    }
    const costCents = script.usage?.costCents;
    if (
      budget?.maxCostCents !== undefined &&
      costCents !== undefined &&
      costCents > budget.maxCostCents
    ) {
      throw new BudgetExceededError(
        `MockLlmProvider: cost ${costCents}¢ exceeds maxCostCents ${budget.maxCostCents}¢.`,
      );
    }

    const usage: LlmUsage = {
      inputTokens,
      outputTokens,
      ...(costCents !== undefined ? { costCents } : {}),
      ...(script.usage?.cached !== undefined ? { cached: script.usage.cached } : {}),
    };
    return {
      text: script.text,
      usage,
      model,
      stopReason: script.stopReason ?? 'stop',
    };
  }

  private pickScript(messages: readonly LlmMessage[], options: LlmCompleteOptions): MockLlmScript {
    if (this.dispatch === 'match-or-error') {
      const hit = this.scripts.find((s) => s.match?.(messages, options) === true);
      if (!hit) {
        throw new Error('MockLlmProvider: no script matched the request.');
      }
      return hit;
    }
    // Queue mode: honour a `match` predicate if it's set; otherwise take
    // the next positional script. Exhausted queue throws.
    while (this.cursor < this.scripts.length) {
      const candidate = this.scripts[this.cursor]!;
      this.cursor += 1;
      if (candidate.match === undefined || candidate.match(messages, options)) {
        return candidate;
      }
    }
    throw new Error('MockLlmProvider: script queue exhausted.');
  }
}

/**
 * Crude character-based token approximator. Good enough for budget
 * assertions in deterministic tests; real adapters report upstream
 * counts instead.
 */
function estimateTokens(messages: readonly LlmMessage[]): number {
  let total = 0;
  for (const m of messages) total += estimateTokensFor(m.content);
  return total;
}

function estimateTokensFor(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
