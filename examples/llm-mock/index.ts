/**
 * Deterministic LLM-backed reasoning loop. Demonstrates the
 * `LlmProviderPort` end-to-end:
 *
 * 1. Build a `MockLlmProvider` whose script queue scripts three
 *    completions in order.
 * 2. Pre-compute one completion per tick by awaiting
 *    `provider.complete(...)` ahead of time. Pre-computation keeps
 *    the example clean of the impedance mismatch between
 *    `Reasoner.selectIntention` (sync) and `provider.complete`
 *    (async). A real adapter that needs per-tick freshness would
 *    queue the next request from the prior tick's reactive handler.
 * 3. Feed the pre-computed decisions into a tiny synchronous
 *    `ScriptedReasoner` driving a `createAgent` agent under
 *    `SeededRng` + `ManualClock` for 5 ticks.
 * 4. Repeat the run from scratch with a freshly-constructed provider
 *    + reasoner and assert that the two `DecisionTrace[]` arrays are
 *    byte-identical — proving determinism through an LLM-backed
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
} from 'agentonomous';

const TICKS = 5;
const PROVIDER_SCRIPTS = [{ text: 'feed' }, { text: 'rest' }, { text: 'noop' }] as const;

function buildProvider(): LlmProviderPort {
  return new MockLlmProvider({
    defaultModel: 'mock-llm-1',
    scripts: PROVIDER_SCRIPTS.map((s) => ({ ...s })),
  });
}

/**
 * Pre-compute one decision per tick by awaiting `provider.complete`
 * sequentially. Returns `''` for ticks past the script queue so the
 * scripted reasoner produces a null intention (`noop`).
 */
async function precomputeDecisions(provider: LlmProviderPort, n: number): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    try {
      const completion = await provider.complete([
        { role: 'system', content: 'You are a pet care assistant. Reply with one verb.' },
        { role: 'user', content: 'What should the pet do next?' },
      ]);
      out.push(completion.text);
    } catch (err) {
      // Only swallow the documented queue-exhausted condition — every
      // other error (budget, malformed request, runtime regression)
      // must surface so the example still works as a smoke test of the
      // LLM port, not just a determinism replay.
      if (isQueueExhausted(err)) {
        out.push('');
        continue;
      }
      throw err;
    }
  }
  return out;
}

function isQueueExhausted(err: unknown): boolean {
  return err instanceof Error && err.message.includes('script queue exhausted');
}

function decisionToIntention(text: string): Intention | null {
  switch (text) {
    case 'feed':
      return { kind: 'satisfy', type: 'feed' };
    case 'rest':
      return { kind: 'satisfy', type: 'rest' };
    default:
      return null;
  }
}

/**
 * Synchronous reasoner backed by a pre-computed decision list. One
 * instance per agent run — its cursor is private state so two parallel
 * runs cannot interfere.
 */
class ScriptedReasoner implements Reasoner {
  private cursor = 0;
  readonly decisions: readonly string[];
  constructor(decisions: readonly string[]) {
    this.decisions = decisions;
  }
  selectIntention(): Intention | null {
    const text = this.decisions[this.cursor++] ?? '';
    return decisionToIntention(text);
  }
}

async function runOnce(): Promise<DecisionTrace[]> {
  const provider = buildProvider();
  const decisions = await precomputeDecisions(provider, TICKS);
  const cat = defineSpecies({ id: 'cat' });
  const agent = createAgent({
    id: 'whiskers',
    species: cat,
    rng: new SeededRng(0xc0ffee),
    clock: new ManualClock(0),
    reasoner: new ScriptedReasoner(decisions),
    persistence: false,
  });
  const traces: DecisionTrace[] = [];
  for (let i = 0; i < TICKS; i++) {
    traces.push(await agent.tick(0.1));
  }
  return traces;
}

const runA = await runOnce();
const runB = await runOnce();

const a = JSON.stringify(runA);
const b = JSON.stringify(runB);
if (a !== b) {
  // eslint-disable-next-line no-console
  console.error('DETERMINISM VIOLATED — traces differ between runs.');
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`OK — ${TICKS} ticks, byte-identical across two runs.`);
