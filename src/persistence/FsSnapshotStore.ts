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
    const out: string[] = [];
    for (const e of entries) {
      if (!e.endsWith('.json')) continue;
      try {
        out.push(decodeKey(e.slice(0, -5)));
      } catch {
        // Malformed `%XX` sequence — a file the encoder wouldn't have
        // produced (foreign tooling, manual drop-in). Skip it; the store
        // can't round-trip it through key-based `load()` anyway, so
        // surfacing it would just hand callers an unusable key.
      }
    }
    return out;
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
    return `${this.directory}${this.sep}${encodeKey(key)}.json`;
  }
}

/**
 * Encode a logical snapshot key into a filesystem-safe filename component.
 *
 * Reversible percent-encoding: every character outside `[A-Za-z0-9._-]`,
 * plus `%` itself, becomes `%XX` — uppercase hex of the UTF-8 byte(s).
 * Keeps the output alphabet strictly `/[A-Za-z0-9._\-%]+/` so `decodeKey`
 * is a clean inverse.
 *
 * Worst case is 3× expansion (every char → `%XX` for one-byte code
 * points, up to 9× for four-byte UTF-8). Callers needing strict path-
 * length safety should bound logical keys at the call site.
 */
export function encodeKey(key: string): string {
  let out = '';
  for (const char of key) {
    if (/^[A-Za-z0-9._-]$/.test(char)) {
      out += char;
    } else {
      // encodeURIComponent emits multi-byte UTF-8 as chained %XX — exactly
      // the byte-wise escaping we want. It leaves `! ' ( ) * ~` unreserved
      // though, so sweep those into %XX too to keep the output alphabet
      // narrow enough for decodeKey to treat every %XX uniformly.
      let escaped = encodeURIComponent(char);
      escaped = escaped.replace(
        /[!'()*~]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
      );
      out += escaped;
    }
  }
  return out;
}

/**
 * Decode a filename (sans `.json` suffix) back into its logical snapshot
 * key. Inverse of `encodeKey`.
 */
export function decodeKey(encoded: string): string {
  return decodeURIComponent(encoded);
}
