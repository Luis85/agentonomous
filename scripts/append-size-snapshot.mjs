#!/usr/bin/env node
// Append one JSONL row to a bundle-size trend file.
//
// Reads `size-limit --json` output from stdin, builds a single
// `{iso, sha, entries}` row, and appends it to `--target <path>`.
//
// Dedupe policy: if the LAST existing row in the target file has the
// same `(date-portion-of-iso, sha)` tuple as the new row, skip the
// append (no-op). Same calendar date + same commit SHA means a
// cron retry on the same fired run — re-recording would produce a
// duplicate point in the time series.
//
// We do NOT dedupe on identical `entries`. A week where bundle sizes
// are unchanged from the previous snapshot MUST still produce a row,
// or the JSONL becomes a change-log instead of a time series and
// breaks weekly trend analysis.
//
// Usage (in the workflow):
//   npx size-limit --json | \
//     node scripts/append-size-snapshot.mjs \
//       --target docs/metrics/bundle-trend.jsonl

import { appendFileSync, readFileSync } from 'node:fs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target') {
      args.target = argv[i + 1];
      i++;
    }
  }
  if (!args.target) {
    process.stderr.write('usage: append-size-snapshot.mjs --target <path>\n');
    process.exit(2);
  }
  return args;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      chunks.push(String(chunk));
    });
    process.stdin.on('end', () => {
      resolve(chunks.join(''));
    });
    process.stdin.on('error', reject);
  });
}

function readLastJsonlRow(target) {
  let raw;
  try {
    raw = readFileSync(target, 'utf8');
  } catch {
    return null;
  }
  const lines = raw.split('\n').filter((line) => line.length > 0);
  if (lines.length === 0) return null;
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

function isoDate(iso) {
  // Take the YYYY-MM-DD prefix of an ISO-8601 timestamp.
  return iso.slice(0, 10);
}

const { target } = parseArgs(process.argv.slice(2));
const stdin = await readStdin();
const sizeLimit = JSON.parse(stdin);
const entries = sizeLimit.map((entry) => ({
  name: entry.name,
  size: entry.size,
  gzip: entry.gzip,
}));
const newRow = {
  iso: new Date().toISOString(),
  sha: process.env.GITHUB_SHA ?? '',
  entries,
};

const lastRow = readLastJsonlRow(target);
const sameRunRetry =
  lastRow?.sha === newRow.sha && isoDate(lastRow?.iso ?? '') === isoDate(newRow.iso);

if (lastRow && sameRunRetry) {
  // Re-run of the same cron firing on the same UTC day → skip.
  process.exit(0);
}

appendFileSync(target, `${JSON.stringify(newRow)}\n`);
