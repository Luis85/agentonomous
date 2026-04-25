/**
 * Deterministic LLM-backed reasoning loop. Demonstrates the
 * `LlmProviderPort` end-to-end:
 *
 * 1. Build a `MockLlmProvider` whose script queue scripts three
 *    completions in order.
 * 2. Wrap it in a tiny `LlmReasoner` that calls `provider.complete(...)`
 *    once per tick, parses the assistant text into an `Intention`.
 * 3. Run a `createAgent`-built agent under `SeededRng` + `ManualClock`
 *    for 5 ticks, capturing each `DecisionTrace`.
 * 4. Repeat the run from scratch and assert that the two trace arrays
 *    are byte-identical — proving determinism through an LLM-backed
 *    reasoning path.
 *
 * No network, no real provider key, no `Date.now()`. The mock honours
 * the same `LlmProviderPort` contract a real Anthropic / OpenAI
 * adapter would (Phase B).
 */
import {
  createAgent,
  defineSpecies,
  ManualClock,
  MockLlmProvider,
  SeededRng,
  type DecisionTrace,
  type Intention,
  type LlmProviderPort,
  type Reasoner,
  type ReasonerContext,
} from 'agentonomous';

// ── 1. Build the mock provider ──────────────────────────────────────────
//
// Three scripts: an "eat" decision, a "rest" decision, then a
// "no-op" decision that yields null. The 4th and 5th ticks fall through
// the queue → the provider rejects them, which the reasoner catches and
// returns null for. That keeps the example small while still exercising
// queue-exhaustion error handling.
const provider: LlmProviderPort = new MockLlmProvider({
  defaultModel: 'mock-llm-1',
  scripts: [{ text: 'feed' }, { text: 'rest' }, { text: 'noop' }],
});

// ── 2. The reasoner: one provider.complete call per tick ───────────────
//
// In a real adapter you'd have a system prompt, a perception block, and
// a structured-output schema. Here we just route plain text → intention
// to keep the wiring legible.
class LlmReasoner implements Reasoner {
  constructor(private readonly provider: LlmProviderPort) {}

  selectIntention(_ctx: ReasonerContext): Intention | null {
    // Reasoner.selectIntention is sync; the LLM is async. For a real
    // adapter you'd queue work to the next tick. Here we cheat by
    // pre-warming a single-completion result via a synchronous deferred
    // so the example stays linear.
    void this.runAsync().then((text) => {
      lastDecision = text;
    });
    const decision = lastDecision;
    lastDecision = null;
    return decisionToIntention(decision);
  }

  private async runAsync(): Promise<string> {
    try {
      const completion = await this.provider.complete([
        { role: 'system', content: 'You are a pet care assistant. Reply with one verb.' },
        { role: 'user', content: 'What should the pet do next?' },
      ]);
      return completion.text;
    } catch {
      // Queue exhausted on tick 4+ — reasoner returns null on next tick.
      return '';
    }
  }
}

let lastDecision: string | null = null;

function decisionToIntention(text: string | null): Intention | null {
  switch (text) {
    case 'feed':
      return { kind: 'satisfy', type: 'feed' };
    case 'rest':
      return { kind: 'satisfy', type: 'rest' };
    default:
      return null;
  }
}

// ── 3. Run an agent for 5 ticks under fixed seed + manual clock ────────
async function runOnce(): Promise<DecisionTrace[]> {
  const traces: DecisionTrace[] = [];
  const cat = defineSpecies({ id: 'cat' });
  const agent = createAgent({
    id: 'whiskers',
    species: cat,
    rng: new SeededRng(0xc0ffee),
    clock: new ManualClock(0),
    reasoner: new LlmReasoner(provider),
    persistence: false,
  });
  for (let i = 0; i < 5; i++) {
    traces.push(await agent.tick(0.1));
  }
  return traces;
}

// ── 4. Two runs under identical seed + provider script → identical traces
const runA = await runOnce();

// Reset the provider's script cursor by constructing a fresh one with the
// same scripts. (MockLlmProvider doesn't expose a `reset()` — building a
// new instance with identical opts is the canonical way to replay.)
const providerB: LlmProviderPort = new MockLlmProvider({
  defaultModel: 'mock-llm-1',
  scripts: [{ text: 'feed' }, { text: 'rest' }, { text: 'noop' }],
});
class LlmReasonerB implements Reasoner {
  selectIntention(_ctx: ReasonerContext): Intention | null {
    void providerB
      .complete([
        { role: 'system', content: 'You are a pet care assistant. Reply with one verb.' },
        { role: 'user', content: 'What should the pet do next?' },
      ])
      .then((c) => {
        lastDecision = c.text;
      })
      .catch(() => undefined);
    const decision = lastDecision;
    lastDecision = null;
    return decisionToIntention(decision);
  }
}

const traces2: DecisionTrace[] = [];
{
  const cat = defineSpecies({ id: 'cat' });
  const agent = createAgent({
    id: 'whiskers',
    species: cat,
    rng: new SeededRng(0xc0ffee),
    clock: new ManualClock(0),
    reasoner: new LlmReasonerB(),
    persistence: false,
  });
  for (let i = 0; i < 5; i++) traces2.push(await agent.tick(0.1));
}

const a = JSON.stringify(runA, replacer);
const b = JSON.stringify(traces2, replacer);
if (a !== b) {
  // eslint-disable-next-line no-console
  console.error('DETERMINISM VIOLATED — traces differ between runs.');
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`OK — ${runA.length} ticks, byte-identical across two runs.`);

/**
 * `JSON.stringify` replacer that strips fields the LLM-driven path
 * can't make deterministic across instances (object identity for
 * `perceived` payloads carrying `Date`-derived fields, etc.).
 *
 * For this example all paths are deterministic already so the replacer
 * is a no-op — kept here to make the determinism boundary explicit.
 */
function replacer(_key: string, value: unknown): unknown {
  return value;
}
