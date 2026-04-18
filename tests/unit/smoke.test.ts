import { describe, expect, it } from 'vitest';
import { VERSION } from '../../src/index.js';

describe('agentonomous smoke test', () => {
  it('exports a VERSION constant', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });
});
