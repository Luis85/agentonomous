#!/usr/bin/env node
/**
 * Build (and optionally post) a sticky PR comment that compares the
 * current branch's vitest coverage to the base branch's coverage and
 * to the floors in `scripts/coverageThresholds.mjs`.
 *
 * Mirrors the size-limit-action sticky-comment UX: one Markdown comment
 * per PR, edited in place across pushes. Marker
 * `<!-- coverage-pr-comment -->` identifies the comment for upserts.
 *
 * Modes (selected by env / args):
 *
 * - `--render-only` (default when no `GITHUB_TOKEN`): print Markdown to
 *   stdout. Useful locally and from `npm run coverage:report`.
 * - `--post`: upsert the sticky comment on the PR. Requires
 *   `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and `--pr <number>`.
 *
 * Inputs:
 *
 * - `--pr-summary <path>`: PR coverage-summary.json (default
 *   `coverage/coverage-summary.json`).
 * - `--base-summary <path>`: base coverage-summary.json. Optional —
 *   when missing, the comment shows absolute % only (no delta) and a
 *   notice that the base summary was not available.
 *
 * Always exits 0. The build-fails-on-regression contract belongs to
 * vitest's threshold check (which trips before we even render); this
 * script is reviewer-facing signal, not a gate.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { argv, env, exit, stdout } from 'node:process';

import { COVERAGE_THRESHOLDS, DRIFT_WARN_PP } from './coverageThresholds.mjs';

const METRICS = /** @type {const} */ (['statements', 'branches', 'functions', 'lines']);
const COMMENT_MARKER = '<!-- coverage-pr-comment -->';

function parseArgs(argList) {
  const out = { mode: 'render-only' };
  for (let i = 2; i < argList.length; i += 1) {
    const arg = argList[i];
    const next = argList[i + 1];
    if (arg === '--render-only') out.mode = 'render-only';
    else if (arg === '--post') out.mode = 'post';
    else if (arg === '--pr-summary') {
      out.prSummary = next;
      i += 1;
    } else if (arg === '--base-summary') {
      out.baseSummary = next;
      i += 1;
    } else if (arg === '--pr') {
      out.pr = next;
      i += 1;
    }
  }
  return out;
}

async function loadSummary(path) {
  if (!path) return undefined;
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw).total;
  } catch (err) {
    if (err?.code === 'ENOENT') return undefined;
    throw err;
  }
}

function metricRow(metric, prTotal, baseTotal) {
  const floor = COVERAGE_THRESHOLDS[metric];
  const actual = prTotal?.[metric]?.pct;
  if (typeof actual !== 'number') return `| \`${metric}\` | _missing_ | — | ${floor}% | — |`;
  const base = baseTotal?.[metric]?.pct;
  let delta = '—';
  if (typeof base === 'number') {
    const diff = actual - base;
    const arrow = diff > 0.005 ? '⬆️' : diff < -0.005 ? '⬇️' : '➖';
    const sign = diff > 0 ? '+' : '';
    delta = `${arrow} ${sign}${diff.toFixed(2)}pp`;
  }
  let status = '✅';
  if (actual < floor) status = `❌ below floor`;
  else if (actual - floor > DRIFT_WARN_PP) {
    status = `⚠️ ${(actual - floor).toFixed(1)}pp above floor — consider re-baselining`;
  }
  return `| \`${metric}\` | ${actual.toFixed(2)}% | ${delta} | ${floor}% | ${status} |`;
}

function render({ prTotal, baseTotal, baseAvailable }) {
  const lines = [
    COMMENT_MARKER,
    '## Coverage report',
    '',
    '| Metric | This PR | vs base | Floor | Status |',
    '| --- | ---: | ---: | ---: | --- |',
  ];
  for (const m of METRICS) lines.push(metricRow(m, prTotal, baseTotal));
  lines.push('');
  if (!baseAvailable) {
    lines.push(
      '_Base-branch coverage summary was not available, so deltas are omitted. Once `develop` has a successful coverage run, the next PR push will show deltas._',
    );
    lines.push('');
  }
  lines.push(
    `_Floors live in \`scripts/coverageThresholds.mjs\` (drift envelope ${DRIFT_WARN_PP}pp). Re-baseline by editing that file when ⚠️ appears above; cite the new measured value + commit SHA._`,
  );
  return lines.join('\n');
}

async function ghJson(path, init = {}) {
  const url = `https://api.github.com${path}`;
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'user-agent': 'agentonomous-coverage-comment',
    ...(init.headers ?? {}),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${init.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

async function listAllComments(repo, pr) {
  // Page through all issue comments. PRs accumulate review threads,
  // bot comments, and back-and-forth quickly — single 100-comment
  // pages can miss the bot's sticky after long discussions, leading
  // to repeated `POST` instead of `PATCH` and a wall of duplicate
  // coverage tables. Cap at 50 pages (5000 comments) — more than
  // any sane PR — to bound the work.
  const out = [];
  for (let page = 1; page <= 50; page += 1) {
    const batch = await ghJson(`/repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function upsertStickyComment({ repo, pr, body }) {
  const existing = await listAllComments(repo, pr);
  // Match the marker AND require a bot-authored comment. A user could
  // legitimately quote the marker text in a review comment (e.g. while
  // discussing the script's behavior); without the bot filter we'd
  // happily overwrite their reply with the next coverage update,
  // breaking conversation continuity.
  const prior = existing.find(
    (c) => typeof c.body === 'string' && c.body.includes(COMMENT_MARKER) && c.user?.type === 'Bot',
  );
  if (prior) {
    await ghJson(`/repos/${repo}/issues/comments/${prior.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    return { action: 'updated', id: prior.id };
  }
  const created = await ghJson(`/repos/${repo}/issues/${pr}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  return { action: 'created', id: created.id };
}

const args = parseArgs(argv);
const prSummaryPath = resolve(process.cwd(), args.prSummary ?? 'coverage/coverage-summary.json');
const baseSummaryPath = args.baseSummary ? resolve(process.cwd(), args.baseSummary) : undefined;

const prTotal = await loadSummary(prSummaryPath);
if (!prTotal) {
  stdout.write(
    `coverage-pr-comment: PR summary not found at ${prSummaryPath}. Run \`npm run test:coverage\` first.\n`,
  );
  exit(0);
}
const baseTotal = baseSummaryPath ? await loadSummary(baseSummaryPath) : undefined;
const body = render({ prTotal, baseTotal, baseAvailable: Boolean(baseTotal) });

if (args.mode === 'render-only') {
  stdout.write(`${body}\n`);
  exit(0);
}

const repo = env.GITHUB_REPOSITORY;
const pr = args.pr ?? env.PR_NUMBER;
if (!env.GITHUB_TOKEN || !repo || !pr) {
  stdout.write(
    'coverage-pr-comment: --post requires GITHUB_TOKEN + GITHUB_REPOSITORY + --pr (or PR_NUMBER). Falling back to render-only:\n\n',
  );
  stdout.write(`${body}\n`);
  exit(0);
}

// Wrap the API write so transient failures (5xx, rate limits) and
// permission slips (403 when fork PRs run without `pull-requests:
// write`) degrade to a stdout fallback instead of failing the
// CI job. The file-level contract says this helper is reviewer
// signal, never a gate — that contract held when only network reads
// could throw, and must keep holding now that we issue writes too.
try {
  const result = await upsertStickyComment({ repo, pr, body });
  stdout.write(`coverage-pr-comment: ${result.action} comment ${result.id} on PR ${pr}.\n`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  stdout.write(
    `coverage-pr-comment: failed to upsert sticky comment (${message}). Falling back to log-only:\n\n`,
  );
  stdout.write(`${body}\n`);
}
exit(0);
