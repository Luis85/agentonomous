import { describe, expect, it } from 'vitest';
import { BudgetExceededError } from '../../../src/agent/errors.js';
import { MockLlmProvider } from '../../../src/ports/MockLlmProvider.js';
import type { LlmMessage } from '../../../src/ports/LlmProviderPort.js';

const ASK: readonly LlmMessage[] = [
  { role: 'system', content: 'You are a pet.' },
  { role: 'user', content: 'meow?' },
];

describe('MockLlmProvider', () => {
  it('serves scripted responses deterministically across runs', async () => {
    const build = () =>
      new MockLlmProvider({
        scripts: [{ text: 'prr' }, { text: 'mrow' }],
        defaultModel: 'mock',
      });

    const runA = [
      await build().complete(ASK),
      await (async () => {
        const p = build();
        await p.complete(ASK);
        return p.complete(ASK);
      })(),
    ];
    const runB = [
      await build().complete(ASK),
      await (async () => {
        const p = build();
        await p.complete(ASK);
        return p.complete(ASK);
      })(),
    ];

    expect(runA).toEqual(runB);
    expect(runA[0]?.text).toBe('prr');
    expect(runA[1]?.text).toBe('mrow');
    expect(runA[0]?.model).toBe('mock');
    expect(runA[0]?.stopReason).toBe('stop');
  });

  it('estimates tokens from content length when usage is not supplied', async () => {
    const provider = new MockLlmProvider({
      scripts: [{ text: 'mrow' }],
    });
    const completion = await provider.complete(ASK);

    // ASK = 'You are a pet.' (14) + 'meow?' (5) → ceil/4 per msg → 4 + 2 = 6.
    expect(completion.usage.inputTokens).toBe(6);
    // 'mrow' = 4 chars → 1 token.
    expect(completion.usage.outputTokens).toBe(1);
  });

  it('throws BudgetExceededError when output exceeds maxOutputTokens', async () => {
    const provider = new MockLlmProvider({
      scripts: [{ text: 'this is a long-ish response', usage: { outputTokens: 20 } }],
    });
    await expect(provider.complete(ASK, { budget: { maxOutputTokens: 5 } })).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
  });

  it('throws BudgetExceededError when input exceeds maxInputTokens', async () => {
    const provider = new MockLlmProvider({
      scripts: [{ text: 'ok' }],
    });
    await expect(provider.complete(ASK, { budget: { maxInputTokens: 1 } })).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
  });

  it('throws BudgetExceededError when cost exceeds maxCostCents', async () => {
    const provider = new MockLlmProvider({
      scripts: [{ text: 'ok', usage: { costCents: 200 } }],
    });
    await expect(provider.complete(ASK, { budget: { maxCostCents: 50 } })).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
  });

  it('returns an abort stub completion when the signal is already aborted', async () => {
    const provider = new MockLlmProvider({ scripts: [{ text: 'ok' }] });
    const controller = new AbortController();
    controller.abort();

    const completion = await provider.complete(ASK, { signal: controller.signal });
    expect(completion.stopReason).toBe('abort');
    expect(completion.text).toBe('');
  });

  it('queue dispatch: honours a match predicate and falls through positionally', async () => {
    const provider = new MockLlmProvider({
      scripts: [
        { text: 'first', match: (msgs) => msgs[0]?.content === 'never' },
        { text: 'fallback' },
      ],
    });

    const completion = await provider.complete(ASK);
    expect(completion.text).toBe('fallback');
  });

  it('match-or-error dispatch: every request must match exactly one script', async () => {
    const provider = new MockLlmProvider({
      dispatch: 'match-or-error',
      scripts: [
        {
          text: 'greeting',
          match: (msgs) => msgs.some((m) => m.role === 'user' && m.content.includes('meow')),
        },
      ],
    });

    const hit = await provider.complete(ASK);
    expect(hit.text).toBe('greeting');

    await expect(provider.complete([{ role: 'user', content: 'bark!' }])).rejects.toThrow(
      /no script matched/,
    );
  });

  it('queue mode throws when scripts are exhausted', async () => {
    const provider = new MockLlmProvider({ scripts: [{ text: 'only' }] });
    await provider.complete(ASK);
    await expect(provider.complete(ASK)).rejects.toThrow(/exhausted/);
  });

  it('counts empty content as 0 tokens (no floor)', async () => {
    const provider = new MockLlmProvider({ scripts: [{ text: '' }] });
    const completion = await provider.complete([{ role: 'user', content: '' }]);

    expect(completion.usage.inputTokens).toBe(0);
    expect(completion.usage.outputTokens).toBe(0);
  });

  it('honours maxOutputTokens: 0 against an empty scripted response', async () => {
    const provider = new MockLlmProvider({ scripts: [{ text: '' }] });
    const completion = await provider.complete(ASK, { budget: { maxOutputTokens: 0 } });
    expect(completion.usage.outputTokens).toBe(0);
  });

  it('reports cached usage when the script marks it', async () => {
    const provider = new MockLlmProvider({
      scripts: [{ text: 'cached', usage: { cached: true, inputTokens: 10, outputTokens: 2 } }],
    });
    const completion = await provider.complete(ASK, {
      model: 'override-model',
    });
    expect(completion.usage.cached).toBe(true);
    expect(completion.model).toBe('override-model');
  });
});
