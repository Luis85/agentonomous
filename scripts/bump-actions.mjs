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

/**
 * Coerce an `execFileSync` failure's `stderr` (Buffer | string | unknown)
 * to a plain UTF-8 string. Avoids the `String(buffer)` cast that
 * `@typescript-eslint/no-base-to-string` flags on `unknown`.
 */
function stderrText(err) {
  if (!err || typeof err !== 'object' || !('stderr' in err)) return '';
  const raw = /** @type {{ stderr: unknown }} */ (err).stderr;
  if (typeof raw === 'string') return raw;
  if (raw instanceof Uint8Array) return new TextDecoder().decode(raw);
  return '';
}

/**
 * Run `gh api` and bucket the outcome into ok / 404 / error so callers can
 * tell "endpoint reports nothing" apart from "tooling/auth/network failure"
 * and surface the latter loudly instead of silently returning null.
 *
 * @param {string[]} args
 * @returns {{ ok: true; value: string }
 *   | { ok: false; kind: 'not-found' }
 *   | { ok: false; kind: 'error'; status: number | undefined; stderr: string; cause: unknown }}
 */
function ghTry(args) {
  try {
    return { ok: true, value: execFileSync('gh', args, { encoding: 'utf8' }).trim() };
  } catch (err) {
    const stderr = stderrText(err);
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number(/** @type {{ status: unknown }} */ (err).status) || undefined
        : undefined;
    if (/HTTP 404|Not Found/i.test(stderr)) {
      return { ok: false, kind: 'not-found' };
    }
    const fallback = err instanceof Error ? err.message : '';
    return {
      ok: false,
      kind: 'error',
      status,
      stderr: stderr.trim() || fallback,
      cause: err,
    };
  }
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

/**
 * Resolve the latest release tag for `owner/repo`. Returns `null` only on
 * a clean 404 (the project really has no GitHub Releases). On any other
 * `gh api` failure (missing CLI, expired auth, network blip, rate limit,
 * 5xx) this throws so the caller can fail loud — the previous "swallow
 * everything as null" form let those errors masquerade as no-releases and
 * silently exit 0.
 */
function latestReleaseTag(owner, repo) {
  const r = ghTry(['api', `repos/${owner}/${repo}/releases/latest`, '--jq', '.tag_name']);
  if (r.ok) return r.value;
  if (r.kind === 'not-found') return null;
  const exit = r.status !== undefined ? ` (exit ${r.status})` : '';
  throw new Error(
    `gh api releases/latest failed for ${owner}/${repo}${exit}: ${r.stderr || '(no stderr)'}`,
    { cause: r.cause },
  );
}

/**
 * Resolve a tag to its commit SHA, peeling annotated tags. Returns `null`
 * only on a clean 404 (tag missing) or when the ref points at neither a
 * commit nor a peelable tag — the caller treats those as "no comparison
 * possible". Any other `gh api` failure throws so transient tooling /
 * network errors surface instead of being silently coerced to "unresolved".
 */
function tagToCommitSha(owner, repo, tag) {
  const refRes = ghTry(['api', `repos/${owner}/${repo}/git/ref/tags/${tag}`]);
  if (!refRes.ok) {
    if (refRes.kind === 'not-found') return null;
    const exit = refRes.status !== undefined ? ` (exit ${refRes.status})` : '';
    throw new Error(
      `gh api git/ref/tags/${tag} failed for ${owner}/${repo}${exit}: ${refRes.stderr || '(no stderr)'}`,
      { cause: refRes.cause },
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(refRes.value);
  } catch (err) {
    const detail = err instanceof Error ? err.message : '';
    throw new Error(
      `Failed to parse gh api ref/tags/${tag} response for ${owner}/${repo}: ${detail}`,
      { cause: err },
    );
  }
  const obj = parsed?.object;
  if (!obj) return null;
  if (obj.type === 'commit') return obj.sha;
  if (obj.type === 'tag') {
    const tagRes = ghTry(['api', `repos/${owner}/${repo}/git/tags/${obj.sha}`]);
    if (!tagRes.ok) {
      if (tagRes.kind === 'not-found') return null;
      const exit = tagRes.status !== undefined ? ` (exit ${tagRes.status})` : '';
      throw new Error(
        `gh api git/tags/${obj.sha} failed for ${owner}/${repo}${exit}: ${tagRes.stderr || '(no stderr)'}`,
        { cause: tagRes.cause },
      );
    }
    let tagParsed;
    try {
      tagParsed = JSON.parse(tagRes.value);
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      throw new Error(
        `Failed to parse gh api git/tags/${obj.sha} response for ${owner}/${repo}: ${detail}`,
        { cause: err },
      );
    }
    return tagParsed?.object?.sha ?? null;
  }
  return null;
}

const files = listWorkflowFiles(workflowsDir);
/** @typedef {{ sha: string; label: string; sources: string[] }} PinVariant */
/** @type {Map<string, PinVariant[]>} */
const pins = new Map();

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = file.slice(repoRoot.length + 1).replaceAll('\\', '/');
  for (const rawLine of text.split(/\r?\n/)) {
    const parsed = parseUses(rawLine);
    if (!parsed) continue;
    const key = `${parsed.owner}/${parsed.repo}`;
    let variants = pins.get(key);
    if (!variants) {
      variants = [];
      pins.set(key, variants);
    }
    let variant = variants.find((v) => v.sha === parsed.sha && v.label === parsed.label);
    if (!variant) {
      variant = { sha: parsed.sha, label: parsed.label, sources: [] };
      variants.push(variant);
    }
    variant.sources.push(rel);
  }
}

if (pins.size === 0) {
  console.log('No SHA-pinned action references found under .github/workflows/.');
  process.exit(0);
}

console.log(`Inspecting ${pins.size} unique action(s) across ${files.length} workflow file(s).`);
console.log('');

/**
 * @typedef {{
 *   action: string;
 *   pinnedLabel: string;
 *   pinnedSha: string;
 *   latestLabel: string;
 *   latestSha: string;
 *   status: 'up-to-date' | 'PENDING' | 'no-releases' | 'unresolved' | 'DIVERGENT' | 'ERROR';
 *   variants: PinVariant[];
 *   errorMsg?: string;
 * }} Row
 */
/** @type {Row[]} */
const rows = [];

for (const [action, variants] of pins) {
  const [owner, repo] = action.split('/');
  let latest = null;
  /** @type {string | null} */
  let latestSha = null;
  /** @type {string | undefined} */
  let errorMsg;
  try {
    latest = latestReleaseTag(owner, repo);
    if (latest) latestSha = tagToCommitSha(owner, repo, latest);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }
  if (errorMsg !== undefined) {
    rows.push({
      action,
      pinnedLabel: variants.length === 1 ? variants[0].label : `(${variants.length} variants)`,
      pinnedSha: variants.length === 1 ? variants[0].sha.slice(0, 7) : '—',
      latestLabel: '—',
      latestSha: '—',
      status: 'ERROR',
      variants,
      errorMsg,
    });
    continue;
  }
  if (variants.length > 1) {
    rows.push({
      action,
      pinnedLabel: `(${variants.length} variants)`,
      pinnedSha: '—',
      latestLabel: latest ?? '—',
      latestSha: latestSha ? latestSha.slice(0, 7) : '—',
      status: 'DIVERGENT',
      variants,
    });
    continue;
  }
  const v = variants[0];
  /** @type {Row['status']} */
  let status;
  if (!latest) status = 'no-releases';
  else if (!latestSha) status = 'unresolved';
  else if (latestSha === v.sha) status = 'up-to-date';
  else status = 'PENDING';
  rows.push({
    action,
    pinnedLabel: v.label,
    pinnedSha: v.sha.slice(0, 7),
    latestLabel: latest ?? '—',
    latestSha: latestSha ? latestSha.slice(0, 7) : '—',
    status,
    variants,
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
const divergent = rows.filter((r) => r.status === 'DIVERGENT');
const errored = rows.filter((r) => r.status === 'ERROR');
console.log('');
if (pending.length > 0) {
  console.log(`${pending.length} pending bump(s):`);
  for (const r of pending) {
    const v = r.variants[0];
    console.log(`  - ${r.action}: ${r.pinnedLabel} → ${r.latestLabel}`);
    console.log(
      `      gh api repos/${r.action}/git/ref/tags/${r.latestLabel}  # peel + verify, then edit ${v.sources[0]}`,
    );
  }
}
if (divergent.length > 0) {
  if (pending.length > 0) console.log('');
  console.log(`${divergent.length} divergent pin(s) (same action, multiple SHA/label tuples):`);
  for (const r of divergent) {
    console.log(`  - ${r.action}: latest=${r.latestLabel} (${r.latestSha})`);
    for (const v of r.variants) {
      console.log(`      ${v.sha.slice(0, 7)}  # ${v.label}`);
      for (const s of v.sources) console.log(`        ${s}`);
    }
  }
}
if (errored.length > 0) {
  if (pending.length > 0 || divergent.length > 0) console.log('');
  console.log(`${errored.length} action(s) failed to resolve:`);
  for (const r of errored) {
    console.log(`  - ${r.action}: ${r.errorMsg ?? '(no message)'}`);
  }
}
if (pending.length === 0 && divergent.length === 0 && errored.length === 0) {
  console.log('All pinned actions match their latest release.');
}

// Exit non-zero on PENDING/DIVERGENT/ERROR so this script can gate a CI
// bot if desired later; today it's run by humans on demand. Failing on
// ERROR (rather than treating tooling/auth/network failures as "no
// releases") keeps the gate honest under broken-tooling conditions.
process.exit(pending.length === 0 && divergent.length === 0 && errored.length === 0 ? 0 : 1);
