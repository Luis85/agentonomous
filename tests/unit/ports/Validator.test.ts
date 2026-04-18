import { describe, expect, it } from 'vitest';
import { PassthroughValidator } from '../../../src/ports/Validator.js';

describe('PassthroughValidator', () => {
  it('accepts any input unchanged', () => {
    const v = new PassthroughValidator();
    const result = v.validate<{ kind: string }>({}, { kind: 'food' });
    expect(result).toEqual({ ok: true, value: { kind: 'food' } });
  });
});
