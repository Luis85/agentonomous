#!/usr/bin/env node
/**
 * Pending-bumps printer for SHA-pinned GitHub Actions in `.github/workflows/`.
 *
 * Every `uses:` reference in our workflows is pinned to a full 40-char
 * commit SHA with a trailing `# <version>` comment (supply-chain hardening
 * per `docs/plans/2026-04-25-comprehensive-polish-and-harden.md` row 3).
 * This script walks the workflow tree, parses each pin, and prints which
 * pins are stale relative to the action's latest release tag.
 *
 * It does NOT auto-write the workflows. The intent is to give a reviewer
 * a single command (`node scripts/bump-actions.mjs`) that produces a diff
 * table of pending bumps; the human then re-resolves the SHA via `gh api`
 * and edits the workflow. This keeps human review on the supply-chain
 * boundary while still flagging when a pin has bit-rotted.
 *
 * Required: GitHub CLI `gh` on PATH and authenticated. The script shells
 * out to `gh api` because it's the same auth path used by every other
 * workflow tool in this repo and avoids a `node_modules` dep on
 * `@octokit/*`.
 *
 * Run: `node scripts/bump-actions.mjs`
 *      `node scripts/bump-actions.mjs --help`
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');

const HELP = `Usage: node scripts/bump-actions.mjs [--help]

Walks .github/workflows/*.yml, parses every SHA-pinned action reference,
and prints a table of pinned-vs-latest mismatches. Read-only — never
edits workflows. Requires GitHub CLI (\`gh\`) authenticated.

Pin format the parser expects:
  - uses: <owner>/<repo>@<40-char-sha>  # <version-label>
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

/** @type {(args: string[]) => string} */
function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

/** Parse a single `uses:` line, returning the pin record or null. */
function parseUses(line) {
  // Match `uses: owner/repo@<sha>  # <label>`. Sub-paths (`owner/repo/dir@sha`)
  // are tolerated; the API lookup uses just `owner/repo`.
  const re =
    /uses:\s+([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)(\/[A-Za-z0-9._/-]+)?@([a-f0-9]{40})\s*#\s*(\S+)/;
  const m = line.match(re);
  if (!m) return null;
  const [, owner, repo, , sha, label] = m;
  return { owner, repo, sha, label };
}

/** Recursively collect `*.yml` and `*.yaml` files under a directory. */
function listWorkflowFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listWorkflowFiles(full));
    } else if (/\.ya?ml$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Resolve the latest release tag for `owner/repo`, or null if none. */
function latestReleaseTag(owner, repo) {
  try {
    return gh(['api', `repos/${owner}/${repo}/releases/latest`, '--jq', '.tag_name']);
  } catch {
    return null;
  }
}

/**
 * Resolve a tag to its commit SHA, peeling annotated tags. Returns null on
 * 404 (tag does not exist) or when the ref points at neither a commit nor
 * a peelable tag — the caller treats those as "no comparison possible".
 */
function tagToCommitSha(owner, repo, tag) {
  let refJson;
  try {
    refJson = gh(['api', `repos/${owner}/${repo}/git/ref/tags/${tag}`]);
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(refJson);
  } catch {
    return null;
  }
  const obj = parsed?.object;
  if (!obj) return null;
  if (obj.type === 'commit') return obj.sha;
  if (obj.type === 'tag') {
    try {
      const tagJson = gh(['api', `repos/${owner}/${repo}/git/tags/${obj.sha}`]);
      const tagParsed = JSON.parse(tagJson);
      return tagParsed?.object?.sha ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

const files = listWorkflowFiles(workflowsDir);
/** @type {Map<string, { sha: string; label: string; sources: string[] }>} */
const pins = new Map();

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = file.slice(repoRoot.length + 1).replaceAll('\\', '/');
  for (const rawLine of text.split(/\r?\n/)) {
    const parsed = parseUses(rawLine);
    if (!parsed) continue;
    const key = `${parsed.owner}/${parsed.repo}`;
    const existing = pins.get(key);
    if (existing) {
      if (existing.sha !== parsed.sha || existing.label !== parsed.label) {
        existing.sources.push(`${rel} (DIVERGENT: ${parsed.sha.slice(0, 7)} ${parsed.label})`);
      } else {
        existing.sources.push(rel);
      }
    } else {
      pins.set(key, { sha: parsed.sha, label: parsed.label, sources: [rel] });
    }
  }
}

if (pins.size === 0) {
  console.log('No SHA-pinned action references found under .github/workflows/.');
  process.exit(0);
}

console.log(`Inspecting ${pins.size} unique action(s) across ${files.length} workflow file(s).`);
console.log('');

const rows = [];
for (const [action, { sha, label, sources }] of pins) {
  const [owner, repo] = action.split('/');
  const latest = latestReleaseTag(owner, repo);
  const latestSha = latest ? tagToCommitSha(owner, repo, latest) : null;
  let status;
  if (!latest) {
    status = 'no-releases';
  } else if (!latestSha) {
    status = 'unresolved';
  } else if (latestSha === sha) {
    status = 'up-to-date';
  } else {
    status = 'PENDING';
  }
  rows.push({
    action,
    pinnedLabel: label,
    pinnedSha: sha.slice(0, 7),
    latestLabel: latest ?? '—',
    latestSha: latestSha ? latestSha.slice(0, 7) : '—',
    status,
    sources,
  });
}

const colWidths = {
  action: Math.max(6, ...rows.map((r) => r.action.length)),
  pinnedLabel: Math.max(7, ...rows.map((r) => r.pinnedLabel.length)),
  pinnedSha: 7,
  latestLabel: Math.max(7, ...rows.map((r) => r.latestLabel.length)),
  latestSha: 7,
  status: Math.max(8, ...rows.map((r) => r.status.length)),
};
const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length));

const header = [
  pad('action', colWidths.action),
  pad('pinned', colWidths.pinnedLabel),
  pad('sha', colWidths.pinnedSha),
  pad('latest', colWidths.latestLabel),
  pad('sha', colWidths.latestSha),
  pad('status', colWidths.status),
].join('  ');
console.log(header);
console.log('-'.repeat(header.length));
for (const r of rows) {
  console.log(
    [
      pad(r.action, colWidths.action),
      pad(r.pinnedLabel, colWidths.pinnedLabel),
      pad(r.pinnedSha, colWidths.pinnedSha),
      pad(r.latestLabel, colWidths.latestLabel),
      pad(r.latestSha, colWidths.latestSha),
      pad(r.status, colWidths.status),
    ].join('  '),
  );
}

const pending = rows.filter((r) => r.status === 'PENDING');
console.log('');
if (pending.length === 0) {
  console.log('All pinned actions match their latest release.');
} else {
  console.log(`${pending.length} pending bump(s):`);
  for (const r of pending) {
    console.log(`  - ${r.action}: ${r.pinnedLabel} → ${r.latestLabel}`);
    console.log(
      `      gh api repos/${r.action}/git/ref/tags/${r.latestLabel}  # peel + verify, then edit ${r.sources[0]}`,
    );
  }
}

// Exit non-zero on PENDING so this script can gate a CI bot if desired
// later; today it's run by humans on demand.
process.exit(pending.length === 0 ? 0 : 1);
