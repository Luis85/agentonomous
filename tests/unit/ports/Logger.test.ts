import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLogger } from '../../../src/ports/ConsoleLogger.js';
import { NullLogger } from '../../../src/ports/Logger.js';

describe('NullLogger', () => {
  it('swallows all levels without throwing', () => {
    const logger = new NullLogger();
    expect(() => {
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
    }).not.toThrow();
  });
});

describe('ConsoleLogger', () => {
  const spies = {
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };

  beforeEach(() => {
    for (const s of Object.values(spies)) s.mockClear();
  });

  afterEach(() => {
    for (const s of Object.values(spies)) s.mockClear();
  });

  it("emits at the configured level and above (default 'info')", () => {
    const logger = new ConsoleLogger();
    logger.debug('skipped');
    logger.info('shown');
    logger.warn('also shown');
    logger.error('also shown');

    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).toHaveBeenCalledWith('shown');
    expect(spies.warn).toHaveBeenCalledWith('also shown');
    expect(spies.error).toHaveBeenCalledWith('also shown');
  });

  it("honors an explicit 'debug' threshold", () => {
    const logger = new ConsoleLogger({ level: 'debug' });
    logger.debug('verbose');
    expect(spies.debug).toHaveBeenCalledWith('verbose');
  });

  it('prepends a tag when provided', () => {
    const logger = new ConsoleLogger({ tag: 'agent-1' });
    logger.info('hello');
    expect(spies.info).toHaveBeenCalledWith('[agent-1] hello');
  });

  it('forwards context objects', () => {
    const logger = new ConsoleLogger();
    logger.warn('something', { needId: 'hunger', level: 0.1 });
    expect(spies.warn).toHaveBeenCalledWith('something', { needId: 'hunger', level: 0.1 });
  });
});
