import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemorySnapshotStore } from '../../../src/persistence/InMemorySnapshotStore.js';
import { LocalStorageSnapshotStore } from '../../../src/persistence/LocalStorageSnapshotStore.js';
import { pickDefaultSnapshotStore } from '../../../src/persistence/pickDefaultSnapshotStore.js';

describe('pickDefaultSnapshotStore', () => {
  const g = globalThis as { localStorage?: unknown };
  let original: unknown;

  beforeEach(() => {
    original = g.localStorage;
  });

  afterEach(() => {
    g.localStorage = original;
  });

  it('returns InMemorySnapshotStore when localStorage is unavailable', () => {
    g.localStorage = undefined;
    const store = pickDefaultSnapshotStore();
    expect(store).toBeInstanceOf(InMemorySnapshotStore);
  });

  it('returns LocalStorageSnapshotStore when a storage-like object is present', () => {
    g.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const store = pickDefaultSnapshotStore();
    expect(store).toBeInstanceOf(LocalStorageSnapshotStore);
  });

  it('returns InMemorySnapshotStore when reading globalThis.localStorage throws (e.g. sandboxed iframe SecurityError)', () => {
    // Install a property descriptor whose getter throws — mirrors the
    // behavior some browsers use for blocked third-party storage access.
    // Save + restore via defineProperty so the outer afterEach's plain
    // assignment can reach a writable property again on cleanup.
    const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('SecurityError');
        },
      });
      expect(() => pickDefaultSnapshotStore()).not.toThrow();
      const store = pickDefaultSnapshotStore();
      expect(store).toBeInstanceOf(InMemorySnapshotStore);
    } finally {
      if (prev) {
        Object.defineProperty(globalThis, 'localStorage', prev);
      } else {
        Object.defineProperty(globalThis, 'localStorage', {
          configurable: true,
          writable: true,
          value: undefined,
        });
      }
    }
  });
});
