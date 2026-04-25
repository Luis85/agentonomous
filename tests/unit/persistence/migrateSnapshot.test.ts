import { describe, expect, it } from 'vitest';
import { SnapshotRestoreError } from '../../../src/agent/errors.js';
import { migrateSnapshot } from '../../../src/persistence/migrateSnapshot.js';

describe('migrateSnapshot', () => {
  it('passes V1 snapshots through unchanged', () => {
    const snap = {
      schemaVersion: 1,
      snapshotAt: 0,
      identity: { id: 'pet', name: 'Pet', version: '0.0.0', role: 'npc', species: 'cat' },
    };
    expect(migrateSnapshot(snap).schemaVersion).toBe(1);
  });

  it('throws on non-object payloads', () => {
    expect(() => migrateSnapshot(null)).toThrow(SnapshotRestoreError);
    expect(() => migrateSnapshot('json')).toThrow(SnapshotRestoreError);
  });

  it('throws when target < current version', () => {
    expect(() =>
      migrateSnapshot(
        {
          schemaVersion: 99,
          snapshotAt: 0,
          identity: { id: 'x', name: 'x', version: '0.0.0', role: 'npc', species: 'cat' },
        },
        1,
      ),
    ).toThrow(/schemaVersion \(99\)/);
  });

  it('throws on NaN / Infinity / fractional / negative schemaVersion', () => {
    const base = {
      snapshotAt: 0,
      identity: { id: 'x', name: 'x', version: '0.0.0', role: 'npc', species: 'cat' },
    };
    for (const bad of [NaN, Infinity, -Infinity, 1.5, -1]) {
      expect(() => migrateSnapshot({ ...base, schemaVersion: bad })).toThrow(SnapshotRestoreError);
      expect(() => migrateSnapshot({ ...base, schemaVersion: bad })).toThrow(
        /Invalid schemaVersion/,
      );
    }
  });
});
