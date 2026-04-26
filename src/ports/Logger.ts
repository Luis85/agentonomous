/**
 * Structured logger port. Implementations decide format, level filtering,
 * and sink. The agent publishes debug/info events through this port so tests
 * can assert on them by injecting a recording logger.
 */
export type Logger = {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
};

/** Logger that swallows every call. Default for silent agents. */
export class NullLogger implements Logger {
  debug(_message: string, _context?: Record<string, unknown>): void {}
  info(_message: string, _context?: Record<string, unknown>): void {}
  warn(_message: string, _context?: Record<string, unknown>): void {}
  error(_message: string, _context?: Record<string, unknown>): void {}
}
