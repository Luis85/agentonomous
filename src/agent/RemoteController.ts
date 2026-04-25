import type { AgentAction } from './AgentAction.js';

/**
 * Port: pulls a batch of `AgentAction`s from an external source each tick
 * when the agent is in `'remote'` control mode. Typical implementations
 * wrap a websocket, message queue, or UI input buffer; the port returns a
 * Promise so asynchronous transports slot in cleanly, but synchronous
 * sources (player input, test doubles) may resolve immediately.
 *
 * An empty batch is a valid reply and simply means "no input this tick";
 * the agent performs no actions but still runs lifecycle / needs / mood.
 *
 * Introduced in M6.
 */
export type RemoteController = {
  /**
   * Pull the next batch of actions for the given agent. The implementation
   * is expected to return any actions that have accumulated since the last
   * pull (FIFO) and clear them from its internal buffer.
   */
  pull(agentId: string, wallNowMs: number): Promise<readonly AgentAction[]>;
};

/**
 * In-memory `RemoteController` used by tests and the built-in simulator.
 * Callers enqueue `AgentAction[]` batches with `push(...)`; each `pull(...)`
 * removes and returns the oldest batch, or an empty array if none is queued.
 *
 * The returned Promise resolves synchronously (no microtask boundary) — the
 * batch has already been dequeued by the time `pull` returns, so tests can
 * assert on the controller's state immediately without `await`-ing.
 */
export class InMemoryRemoteController implements RemoteController {
  private readonly queue: (readonly AgentAction[])[] = [];

  /** Enqueue a batch of actions for the next `pull(...)`. */
  push(actions: readonly AgentAction[]): void {
    this.queue.push(actions);
  }

  /**
   * Remove and return the oldest queued batch, or an empty array if the
   * queue is empty. `agentId` / `wallNowMs` are accepted to match the port
   * shape but ignored by this implementation.
   */
  pull(_agentId: string, _wallNowMs: number): Promise<readonly AgentAction[]> {
    const next = this.queue.shift();
    return Promise.resolve(next ?? []);
  }

  /** Number of batches currently buffered. Handy for tests. */
  get size(): number {
    return this.queue.length;
  }

  /** Drop every queued batch without returning them. */
  clear(): void {
    this.queue.length = 0;
  }
}
