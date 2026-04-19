import { describe, expect, it } from 'vitest';
import { AGENT_TICKED, type AgentTickedEvent } from '../../../src/events/standardEvents.js';
import type { DecisionTrace } from '../../../src/agent/DecisionTrace.js';

describe('AgentTicked event vocabulary', () => {
  it('exports the constant as the exact string literal `"AgentTicked"`', () => {
    expect(AGENT_TICKED).toBe('AgentTicked');
  });

  it('accepts a well-formed event shape at compile time', () => {
    const traceStub: DecisionTrace = {
      agentId: 'test',
      tickStartedAt: 1000,
      virtualDtSeconds: 0.1,
      controlMode: 'autonomous',
      stage: 'alive',
      halted: false,
      perceived: [],
      actions: [],
      emitted: [],
    };
    const event: AgentTickedEvent = {
      type: AGENT_TICKED,
      at: 1000,
      agentId: 'test',
      tickNumber: 1,
      virtualDtSeconds: 0.1,
      wallDtSeconds: 0.01,
      selectedAction: null,
      trace: traceStub,
    };
    expect(event.type).toBe('AgentTicked');
    expect(event.tickNumber).toBe(1);
    expect(event.trace).toBe(traceStub);
  });
});
