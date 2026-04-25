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

    const picked = this.pickScript(messages, options);
    const script = picked.script;
    const model = script.model ?? options.model ?? this.defaultModel;
    // Request-side input count used for the budget check — scripts must
    // not be able to under-report `inputTokens` and sneak an oversize
    // prompt past `maxInputTokens`. The reported usage on the completion
    // still honours the script override so tests can pin exact numbers.
    const requestInputTokens = estimateTokens(messages);
    const reportedInputTokens = script.usage?.inputTokens ?? requestInputTokens;
    const outputTokens = script.usage?.outputTokens ?? estimateTokensFor(script.text);
    const costCents = script.usage?.costCents;

    enforceBudget(options.budget, requestInputTokens, outputTokens, costCents);

    // Only commit the queue cursor once budget checks have passed —
    // otherwise a budget-rejected request would consume a scripted
    // entry and make retries non-deterministic.
    picked.commit();

    return {
      text: script.text,
      usage: buildUsage(reportedInputTokens, outputTokens, costCents, script.usage?.cached),
      model,
      stopReason: script.stopReason ?? 'stop',
    };
  }

  private pickScript(
    messages: readonly LlmMessage[],
    options: LlmCompleteOptions,
  ): { script: MockLlmScript; commit: () => void } {
    if (this.dispatch === 'match-or-error') {
      // Strict dispatch must fail fast on both zero and multi-match — the
      // whole point is that each request resolves to exactly one scripted
      // response. Silently taking the first match would mask misconfigured
      // scripts and produce the wrong completion in replay tests.
      const hits = this.scripts.filter((s) => s.match?.(messages, options) === true);
      if (hits.length === 0) {
        throw new Error('MockLlmProvider: no script matched the request.');
      }
      if (hits.length > 1) {
        throw new Error(
          `MockLlmProvider: ${hits.length} scripts matched the request (match-or-error requires exactly one).`,
        );
      }
      // match-or-error has no queue state to advance; commit is a no-op.
      const [only] = hits;
      if (!only) throw new Error('MockLlmProvider: no script matched the request.');
      return { script: only, commit: () => undefined };
    }
    // Queue mode: honour a `match` predicate if it's set; otherwise take
    // the next positional script. Exhausted queue throws. The returned
    // `commit` advances the queue cursor; callers defer it until after
    // budget checks so a rejected request doesn't consume an entry.
    for (let i = this.cursor; i < this.scripts.length; i++) {
      const candidate = this.scripts[i];
      if (!candidate) continue;
      if (candidate.match === undefined || candidate.match(messages, options)) {
        const advanceTo = i + 1;
        return {
          script: candidate,
          commit: () => {
            this.cursor = advanceTo;
          },
        };
      }
    }
    throw new Error('MockLlmProvider: script queue exhausted.');
  }
}

function enforceBudget(
  budget: LlmCompleteOptions['budget'],
  inputTokens: number,
  outputTokens: number,
  costCents: number | undefined,
): void {
  if (!budget) return;
  if (budget.maxInputTokens !== undefined && inputTokens > budget.maxInputTokens) {
    throw new BudgetExceededError(
      `MockLlmProvider: input ${inputTokens} tokens exceeds maxInputTokens ${budget.maxInputTokens}.`,
    );
  }
  if (budget.maxOutputTokens !== undefined && outputTokens > budget.maxOutputTokens) {
    throw new BudgetExceededError(
      `MockLlmProvider: output ${outputTokens} tokens exceeds maxOutputTokens ${budget.maxOutputTokens}.`,
    );
  }
  if (
    budget.maxCostCents !== undefined &&
    costCents !== undefined &&
    costCents > budget.maxCostCents
  ) {
    throw new BudgetExceededError(
      `MockLlmProvider: cost ${costCents}¢ exceeds maxCostCents ${budget.maxCostCents}¢.`,
    );
  }
}

function buildUsage(
  inputTokens: number,
  outputTokens: number,
  costCents: number | undefined,
  cached: boolean | undefined,
): LlmUsage {
  return {
    inputTokens,
    outputTokens,
    ...(costCents !== undefined ? { costCents } : {}),
    ...(cached !== undefined ? { cached } : {}),
  };
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
  // Empty strings count as 0 tokens so `maxOutputTokens: 0` with an empty
  // scripted response behaves as documented. Honoring the ceil/4
  // convention strictly — no floor.
  return Math.ceil(text.length / 4);
}
