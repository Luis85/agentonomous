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
export type MockLlmScript = {
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
};

/** Construction options for `MockLlmProvider`. */
export type MockLlmProviderOptions = {
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
};

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
    const dispatch = options.dispatch ?? 'queue';
    if (dispatch === 'match-or-error') {
      const bad = options.scripts.findIndex((s) => s.match === undefined);
      if (bad !== -1) {
        throw new Error(
          `MockLlmProvider: script[${bad}] has no 'match' predicate ` +
            `(required in match-or-error mode — positional fallback is disabled).`,
        );
      }
    }
    this.scripts = options.scripts;
    this.defaultModel = options.defaultModel ?? 'mock-llm';
    this.dispatch = dispatch;
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
      return abortStub(options.model ?? this.defaultModel);
    }

    const picked = this.pickScript(messages, options);
    return runScript(picked, messages, options, this.defaultModel);
  }

  private pickScript(messages: readonly LlmMessage[], options: LlmCompleteOptions): PickedScript {
    return this.dispatch === 'match-or-error'
      ? pickFromMatchOrError(this.scripts, messages, options)
      : pickFromQueue(this.scripts, this.cursor, messages, options, (next) => {
          this.cursor = next;
        });
  }
}

/**
 * Selected script plus a `commit` thunk the caller invokes once the
 * request has passed budget checks. Deferring the commit keeps queue
 * mode deterministic across retries (a budget-rejected request must
 * not consume a queued script).
 */
type PickedScript = {
  readonly script: MockLlmScript;
  readonly commit: () => void;
};

/**
 * Build the `'abort'` stub completion returned when an already-aborted
 * `AbortSignal` is passed in. Kept as its own helper so `completeSync`
 * stays a flat dispatcher.
 */
function abortStub(model: string): LlmCompletion {
  return {
    text: '',
    usage: { inputTokens: 0, outputTokens: 0 },
    model,
    stopReason: 'abort',
  };
}

/**
 * Apply budget checks then construct the completion. Mutating the
 * cursor (in queue mode) is deferred to `picked.commit()` so a
 * budget-rejected request leaves queue state untouched.
 */
function runScript(
  picked: PickedScript,
  messages: readonly LlmMessage[],
  options: LlmCompleteOptions,
  defaultModel: string,
): LlmCompletion {
  const { script } = picked;
  const model = script.model ?? options.model ?? defaultModel;
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

/**
 * Strict dispatch: every request must resolve to exactly one matching
 * script. Zero-match and multi-match both throw — silently taking the
 * first match would mask misconfigured scripts and produce the wrong
 * completion under replay. No queue state to advance, so `commit` is
 * a no-op.
 */
function pickFromMatchOrError(
  scripts: readonly MockLlmScript[],
  messages: readonly LlmMessage[],
  options: LlmCompleteOptions,
): PickedScript {
  const hits = scripts.filter((s) => s.match?.(messages, options) === true);
  if (hits.length === 0) {
    throw new Error('MockLlmProvider: no script matched the request.');
  }
  if (hits.length > 1) {
    throw new Error(
      `MockLlmProvider: ${hits.length} scripts matched the request (match-or-error requires exactly one).`,
    );
  }
  const [only] = hits;
  if (!only) throw new Error('MockLlmProvider: no script matched the request.');
  return { script: only, commit: () => undefined };
}

/**
 * Queue dispatch: honour a `match` predicate when set; otherwise take
 * the next positional script. Exhausted queue throws. The returned
 * `commit` thunk advances the cursor via `setCursor`, deferred until
 * after budget checks so rejected requests don't consume an entry.
 */
function pickFromQueue(
  scripts: readonly MockLlmScript[],
  cursor: number,
  messages: readonly LlmMessage[],
  options: LlmCompleteOptions,
  setCursor: (next: number) => void,
): PickedScript {
  for (let i = cursor; i < scripts.length; i++) {
    const candidate = scripts[i];
    if (!candidate) continue;
    if (candidate.match === undefined || candidate.match(messages, options)) {
      const advanceTo = i + 1;
      return {
        script: candidate,
        commit: () => setCursor(advanceTo),
      };
    }
  }
  throw new Error('MockLlmProvider: script queue exhausted.');
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
