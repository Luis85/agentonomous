import type { AgentSnapshot } from './AgentSnapshot.js';
import type { SnapshotStorePort } from './SnapshotStorePort.js';

/**
 * Minimal fs surface the store needs. Consumers pass `node:fs/promises` or
 * a stub in tests.
 */
export interface FsAdapter {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  mkdir(path: string, opts: { recursive: true }): Promise<void | string | undefined>;
  readdir(path: string): Promise<string[]>;
  unlink(path: string): Promise<void>;
  access(path: string): Promise<void>;
}

export interface FsSnapshotStoreOptions {
  directory: string;
  fs: FsAdapter;
  /** Path separator. Defaults to `'/'`. */
  sep?: string;
}

/**
 * Filesystem-backed snapshot store for Node consumers. Each key becomes a
 * JSON file under `directory/<key>.json`. The file system is injected so
 * the library stays browser-compatible.
 */
export class FsSnapshotStore implements SnapshotStorePort {
  private readonly directory: string;
  private readonly fs: FsAdapter;
  private readonly sep: string;
  private ensured = false;

  constructor(opts: FsSnapshotStoreOptions) {
    this.directory = opts.directory;
    this.fs = opts.fs;
    this.sep = opts.sep ?? '/';
  }

  async save(key: string, snapshot: AgentSnapshot): Promise<void> {
    await this.ensureDir();
    await this.fs.writeFile(this.pathFor(key), JSON.stringify(snapshot), 'utf8');
  }

  async load(key: string): Promise<AgentSnapshot | null> {
    try {
      await this.fs.access(this.pathFor(key));
    } catch {
      return null;
    }
    const raw = await this.fs.readFile(this.pathFor(key), 'utf8');
    return JSON.parse(raw) as AgentSnapshot;
  }

  async list(): Promise<readonly string[]> {
    await this.ensureDir();
    const entries = await this.fs.readdir(this.directory);
    return entries.filter((e) => e.endsWith('.json')).map((e) => e.slice(0, -5));
  }

  async delete(key: string): Promise<void> {
    try {
      await this.fs.unlink(this.pathFor(key));
    } catch {
      // Already gone — idempotent delete.
    }
  }

  private async ensureDir(): Promise<void> {
    if (this.ensured) return;
    await this.fs.mkdir(this.directory, { recursive: true });
    this.ensured = true;
  }

  private pathFor(key: string): string {
    return `${this.directory}${this.sep}${sanitizeKey(key)}.json`;
  }
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}
