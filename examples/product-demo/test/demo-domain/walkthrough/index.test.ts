import { describe, expect, it } from 'vitest';

import * as walkthrough from '../../../src/demo-domain/walkthrough/index.js';

describe('walkthrough barrel', () => {
  it('re-exports the public surface', () => {
    expect(walkthrough.TOUR_END).toBe('end');
    expect(typeof walkthrough.defineWalkthroughGraph).toBe('function');
    expect(typeof walkthrough.getNextStep).toBe('function');
    expect(typeof walkthrough.getSkipTarget).toBe('function');
    expect(typeof walkthrough.getStepById).toBe('function');
    expect(typeof walkthrough.getChapterSteps).toBe('function');
    expect(typeof walkthrough.combineAll).toBe('function');
    expect(typeof walkthrough.combineAny).toBe('function');
    expect(typeof walkthrough.not).toBe('function');
    expect(typeof walkthrough.onRoute).toBe('function');
    expect(typeof walkthrough.onRoutePrefix).toBe('function');
    expect(typeof walkthrough.tickAtLeast).toBe('function');
    expect(typeof walkthrough.cognitionModeIs).toBe('function');
    expect(typeof walkthrough.eventEmittedSince).toBe('function');
    expect(typeof walkthrough.walkthroughStepId).toBe('function');
    expect(typeof walkthrough.selectorHandle).toBe('function');
    expect(walkthrough.ALWAYS({} as never)).toBe(true);
    expect(walkthrough.NEVER({} as never)).toBe(false);
    expect(walkthrough.WalkthroughGraphError).toBeDefined();
  });
});
