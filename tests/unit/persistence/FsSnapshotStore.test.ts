import { describe, expect, it } from 'vitest';
import type { AgentSnapshot } from '../../../src/persistence/AgentSnapshot.js';
import {
  decodeKey,
  encodeKey,
  FsSnapshotStore,
  type FsAdapter,
} from '../../../src/persistence/FsSnapshotStore.js';

/** Build a minimal snapshot carrying the logical key on `identity.id`. */
function snap(id: string): AgentSnapshot {
  return {
    schemaVersion: 2,
    snapshotAt: 0,
    identity: { id, name: id, version: '0.0.0', role: 'npc', species: 'cat' },
  };
}

/**
 * In-memory `FsAdapter` stub. Files are stored under their full path; the
 * stub resolves `readdir(dir)` by prefix-matching those paths, which mirrors
 * real filesystem semantics closely enough for the store's purposes.
 */
class MemFs implements FsAdapter {
  readonly files = new Map<string, string>();
  readFile(path: string, _encoding: 'utf8'): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) return Promise.reject(new Error('ENOENT'));
    return Promise.resolve(v);
  }
  writeFile(path: string, data: string, _encoding: 'utf8'): Promise<void> {
    this.files.set(path, data);
    return Promise.resolve();
  }
  mkdir(_path: string, _opts: { recursive: true }): Promise<void> {
    return Promise.resolve();
  }
  readdir(dir: string): Promise<string[]> {
    const prefix = `${dir}/`;
    return Promise.resolve(
      [...this.files.keys()].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)),
    );
  }
  unlink(path: string): Promise<void> {
    this.files.delete(path);
    return Promise.resolve();
  }
  access(path: string): Promise<void> {
    return this.files.has(path) ? Promise.resolve() : Promise.reject(new Error('ENOENT'));
  }
}

describe('encodeKey / decodeKey', () => {
  it('round-trips the safe alphabet unchanged', () => {
    const keys = ['abc', 'ABC', '123', 'foo.bar', 'foo_bar', 'foo-bar'];
    for (const k of keys) {
      expect(encodeKey(k)).toBe(k);
      expect(decodeKey(encodeKey(k))).toBe(k);
    }
  });

  it('escapes path separators, spaces, and common symbols', () => {
    expect(encodeKey('user/1')).toBe('user%2F1');
    expect(encodeKey('user 1')).toBe('user%201');
    expect(encodeKey('user:1')).toBe('user%3A1');
    expect(encodeKey('user@example.com')).toBe('user%40example.com');
  });

  it('escapes the percent character itself for round-trip safety', () => {
    expect(encodeKey('50% off')).toBe('50%25%20off');
    expect(decodeKey(encodeKey('50% off'))).toBe('50% off');
  });

  it('escapes multi-byte unicode via UTF-8 byte-wise %XX sequences', () => {
    expect(encodeKey('café')).toBe('caf%C3%A9');
    expect(decodeKey('caf%C3%A9')).toBe('café');
  });

  it('escapes the spec-unreserved chars that encodeURIComponent leaves alone', () => {
    // encodeURIComponent leaves ! ' ( ) * ~ unreserved; our encoder must not.
    expect(encodeKey('a!b')).toBe('a%21b');
    expect(encodeKey("a'b")).toBe('a%27b');
    expect(encodeKey('a(b)')).toBe('a%28b%29');
    expect(encodeKey('a*b')).toBe('a%2Ab');
    expect(encodeKey('a~b')).toBe('a%7Eb');
  });

  it('previously-colliding keys now map to distinct filenames', () => {
    // Pre-fix, sanitizeKey mapped all three to `user_1`.
    expect(encodeKey('user/1')).not.toBe(encodeKey('user_1'));
    expect(encodeKey('user 1')).not.toBe(encodeKey('user_1'));
    expect(encodeKey('user/1')).not.toBe(encodeKey('user 1'));
  });
});

describe('FsSnapshotStore', () => {
  it('save / load round-trips a logical key with symbols', async () => {
    const fs = new MemFs();
    const store = new FsSnapshotStore({ directory: '/var/snaps', fs });
    const key = 'user@ex.com/nurturing 1';
    await store.save(key, snap(key));
    const loaded = await store.load(key);
    expect(loaded?.identity.id).toBe(key);
  });

  it('list() decodes encoded filenames back to logical keys', async () => {
    const fs = new MemFs();
    const store = new FsSnapshotStore({ directory: '/var/snaps', fs });
    await store.save('user/1', snap('user/1'));
    await store.save('user_1', snap('user_1'));
    await store.save('café', snap('café'));

    const keys = await store.list();
    expect(new Set(keys)).toEqual(new Set(['user/1', 'user_1', 'café']));
  });

  it('previously-colliding keys do not overwrite each other', async () => {
    const fs = new MemFs();
    const store = new FsSnapshotStore({ directory: '/var/snaps', fs });
    await store.save('user/1', snap('via-slash'));
    await store.save('user_1', snap('via-underscore'));
    await store.save('user 1', snap('via-space'));

    expect((await store.load('user/1'))?.identity.id).toBe('via-slash');
    expect((await store.load('user_1'))?.identity.id).toBe('via-underscore');
    expect((await store.load('user 1'))?.identity.id).toBe('via-space');
  });

  it('delete() removes the encoded filename and keeps siblings intact', async () => {
    const fs = new MemFs();
    const store = new FsSnapshotStore({ directory: '/var/snaps', fs });
    await store.save('user/1', snap('user/1'));
    await store.save('user_1', snap('user_1'));

    await store.delete('user/1');
    expect(await store.load('user/1')).toBeNull();
    expect((await store.load('user_1'))?.identity.id).toBe('user_1');
  });

  it('delete() is idempotent on missing keys', async () => {
    const fs = new MemFs();
    const store = new FsSnapshotStore({ directory: '/var/snaps', fs });
    await expect(store.delete('never-saved')).resolves.toBeUndefined();
  });

  it('list() returns keys in deterministic localeCompare order regardless of readdir order', async () => {
    // Stub readdir to return an unsorted response — real filesystems do
    // this (ext4 hash order, NTFS MFT order, tmpfs insertion order), so
    // list() must sort before returning to give callers reproducible
    // output across platforms.
    const unsorted = ['charlie.json', 'alpha.json', 'bravo.json', 'aardvark.json'];
    const fs: FsAdapter = {
      readFile: () => Promise.resolve('{}'),
      writeFile: () => Promise.resolve(),
      mkdir: () => Promise.resolve(),
      readdir: () => Promise.resolve([...unsorted]),
      unlink: () => Promise.resolve(),
      access: () => Promise.resolve(),
    };
    const store = new FsSnapshotStore({ directory: '/var/snaps', fs });

    const keys = await store.list();
    expect(keys).toEqual(['aardvark', 'alpha', 'bravo', 'charlie']);
  });

  it('list() skips files whose names the encoder would never produce', async () => {
    // Foreign `.json` files in a shared snapshot directory must not cause
    // list() to reject — `decodeURIComponent` throws URIError on malformed
    // `%XX` sequences; the store drops those entries and returns the
    // decodable subset.
    const fs = new MemFs();
    const store = new FsSnapshotStore({ directory: '/var/snaps', fs });
    await store.save('good-key', snap('good-key'));
    // Drop a file the encoder would never emit (bare `%ZZ`).
    fs.files.set('/var/snaps/bad%ZZ.json', '{}');

    const keys = await store.list();
    expect(keys).toEqual(['good-key']);
  });
});
