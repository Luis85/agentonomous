// ConsoleLogger is the single legal `console` user in the library.
import type { Logger } from './Logger.js';

export type ConsoleLogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<ConsoleLogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export type ConsoleLoggerOptions = {
  /** Minimum level to emit. Defaults to `'info'`. */
  level?: ConsoleLogLevel;
  /** Optional tag prepended to every message. */
  tag?: string;
};

/** Logger backed by the global `console`. Suitable for browser + Node. */
export class ConsoleLogger implements Logger {
  private readonly threshold: number;
  private readonly tag: string | undefined;

  constructor(opts: ConsoleLoggerOptions = {}) {
    this.threshold = ORDER[opts.level ?? 'info'];
    this.tag = opts.tag;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write('error', message, context);
  }

  private write(level: ConsoleLogLevel, message: string, context?: Record<string, unknown>): void {
    if (ORDER[level] < this.threshold) return;
    const prefix = this.tag ? `[${this.tag}] ` : '';
    if (context) {
      console[level](`${prefix}${message}`, context);
    } else {
      console[level](`${prefix}${message}`);
    }
  }
}
