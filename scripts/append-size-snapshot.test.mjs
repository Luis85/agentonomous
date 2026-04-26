// scripts/append-size-snapshot.test.mjs
import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(target, fixture, sha) {
  return spawnSync(process.execPath, ['scripts/append-size-snapshot.mjs', '--target', target], {
    input: fixture,
    env: { ...process.env, GITHUB_SHA: sha },
  });
}

test('appends one JSONL row from size-limit JSON on stdin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sizesnap-'));
  const target = join(dir, 'bundle-trend.jsonl');
  writeFileSync(target, ''); // empty
  const fixture = JSON.stringify([
    { name: 'core', size: 1234, gzip: 567 },
    { name: 'integrations/excalibur', size: 200, gzip: 100 },
  ]);
  const out = run(target, fixture, 'abcdef0');
  expect(out.status).toBe(0);
  const rows = readFileSync(target, 'utf8').trim().split('\n').filter(Boolean);
  expect(rows).toHaveLength(1);
  const row = JSON.parse(rows[0]);
  expect(row.sha).toBe('abcdef0');
  expect(row.entries).toHaveLength(2);
  expect(row.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test('dedupes a same-day same-sha re-run (workflow_dispatch retry)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sizesnap-'));
  const target = join(dir, 'bundle-trend.jsonl');
  writeFileSync(target, '');
  const fixture = JSON.stringify([{ name: 'core', size: 100, gzip: 50 }]);
  expect(run(target, fixture, 'cafef00').status).toBe(0);
  expect(run(target, fixture, 'cafef00').status).toBe(0); // same (sha, date)
  const rows = readFileSync(target, 'utf8').trim().split('\n').filter(Boolean);
  expect(rows).toHaveLength(1); // second invocation was a no-op
});

test('appends a new row when entries are unchanged but sha differs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sizesnap-'));
  const target = join(dir, 'bundle-trend.jsonl');
  writeFileSync(target, '');
  // Identical bundle payload week-over-week MUST still produce a
  // new row — the JSONL is a snapshot time series, not a changelog.
  const fixture = JSON.stringify([{ name: 'core', size: 100, gzip: 50 }]);
  expect(run(target, fixture, 'aaaaaaa').status).toBe(0);
  expect(run(target, fixture, 'bbbbbbb').status).toBe(0);
  const rows = readFileSync(target, 'utf8').trim().split('\n').filter(Boolean);
  expect(rows).toHaveLength(2);
});
