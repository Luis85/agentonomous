# `llm-mock` — deterministic LLM-backed reasoning

Minimal Node example. Wires a `MockLlmProvider` (deterministic, no
network) into a tiny `LlmReasoner` and runs a `createAgent`-built agent
under `SeededRng` + `ManualClock` for 5 ticks. Re-runs the same scenario
from scratch and asserts the two `DecisionTrace[]` arrays are
byte-identical — proving that an LLM-backed cognition path can still
honour the library's determinism contract when the provider is
deterministic.

## Run it

```bash
# From the repo root.
npm install
npm run build              # populates dist/

# In this directory.
cd examples/llm-mock
npm install
npm run start
```

Expected output:

```
OK — 5 ticks, byte-identical across two runs.
```

## What the example demonstrates

1. **`LlmProviderPort` shape.** `MockLlmProvider` implements the
   port; a real `AnthropicLlmProvider` / `OpenAiLlmProvider` (Phase B)
   would slot in via the same interface.
2. **Script queue.** The mock dispatches scripts in order; one per
   request. Useful for golden-trace replays in tests.
3. **Determinism through an LLM path.** Two runs with identical
   provider scripts + identical seed produce identical traces.

## What it does NOT cover

- Real network. There is no production adapter in this 1.0 scope —
  Phase B adds `AnthropicLlmProvider` and `OpenAiLlmProvider`.
- Streaming. `LlmProviderPort.complete(...)` returns a single
  completion; streaming + tool-use are additive Phase B methods.
- Structured output. The reasoner parses raw text → an `Intention`.

## Files

- `index.ts` — the runnable example.
- `package.json` — declares a `file:../..` dep on the local library
  build under `dist/`.
