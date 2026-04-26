#!/usr/bin/env node
/**
 * review-fix tracker parser.
 *
 * Reads a JSON list of `review-bot`-labelled issues (one issue per
 * scheduled bot run, findings live in the issue body) and emits a
 * structured description of either:
 *   - the most recent issue that contains finding markers (sweep
 *     mode, default), or
 *   - the issue whose body holds a specific finding ID (single mode,
 *     `--id <sha7>.<idx>`), scanning every issue in the input
 *     newest-first.
 *
 * Input shape — array of GitHub issue objects:
 *   [
 *     { "number": 142, "body": "...", "url": "...", "createdAt": "ISO8601" },
 *     { "number":  87, "body": "...", "url": "...", "createdAt": "ISO8601" },
 *     ...
 *   ]
 *
 * The caller fetches this via:
 *   gh issue list --label review-bot --state open \
 *     --json number,body,url,createdAt --limit 50 \
 *     > .review-fix-cache/issues.json
 *
 * A single-issue object (no array wrapper) is also accepted for
 * convenience — it is wrapped into a one-element list before parsing.
 *
 * Used by the `review-fix` skill to sidestep platform-specific shell
 * pitfalls:
 *   - Windows Git Bash maps `/tmp` to `D:\tmp` for native binaries,
 *     breaking Node `fs.readFileSync('/tmp/...')`.
 *   - `jq` is not installed by default on Windows or many CI images.
 *
 * Node is a hard project requirement (TypeScript library, ESM, Node 22
 * per `.nvmrc`), so this script is the canonical parser the skill
 * shells out to.
 *
 * Sweep-mode output:
 *   {
 *     "issueNumber": <number>,
 *     "issueUrl":    <string>,
 *     "createdAt":   <iso8601>,
 *     "findings":    [Finding, ...]
 *   }
 *
 * Single-mode output:
 *   {
 *     "issueNumber": <number>,
 *     "issueUrl":    <string>,
 *     "createdAt":   <iso8601>,
 *     "finding":     Finding
 *   }
 *
 * Finding shape:
 *   {
 *     "id":        "<sha7>.<idx>",
 *     "shipped":   <bool>,
 *     "shippedPr": <number|null>,
 *     "severity":  "BLOCKER" | "MAJOR" | "MINOR" | "NIT",
 *     "path":      "<repo-relative path[:line]>",
 *     "title":     "<one-line>",
 *     "body":      "<raw verbatim body chunk, may include diff blocks>"
 *   }
 *
 * Exit codes:
 *   0  success
 *   1  no issue / no finding matched
 *   2  bad CLI arguments
 *   3  finding matched but already shipped (single mode only)
 */

import { readFileSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';

const args = argv.slice(2);
const inputPath = args[0];
let targetId = null;
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === '--id') {
    targetId = args[i + 1];
    i += 1;
  }
}

if (!inputPath) {
  stderr.write('usage: review-fix-parse.mjs <issues.json> [--id <sha7>.<idx>]\n');
  exit(2);
}
if (targetId !== null && !/^[A-Za-z0-9]+\.[0-9]+$/.test(targetId)) {
  stderr.write(`--id expects <sha7>.<idx> shape (e.g. 682b557.3), got "${targetId}"\n`);
  exit(2);
}

const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
// Accept either an array of issues or a single issue object.
const issues = Array.isArray(raw) ? raw : [raw];

// Pre-parse every issue body. Sort newest-first so sweep picks the
// freshest tracker without another pass.
const withFindings = issues
  .filter((iss) => typeof iss.body === 'string')
  .map((iss) => ({ issue: iss, findings: parseFindings(iss.body) }))
  .filter((entry) => entry.findings.length > 0)
  .sort((a, b) => new Date(b.issue.createdAt) - new Date(a.issue.createdAt));

if (withFindings.length === 0) {
  stderr.write('No open review-bot issue contains findings — nothing to sweep\n');
  exit(1);
}

if (targetId === null) {
  // Sweep: every finding from the newest issue that has any.
  const newest = withFindings[0];
  emit({
    issueNumber: newest.issue.number,
    issueUrl: newest.issue.url,
    createdAt: newest.issue.createdAt,
    findings: newest.findings,
  });
  exit(0);
}

// Single: scan newest-first across every issue. The first match wins;
// duplicate IDs across issues would only happen if the bot re-emitted
// an old finding, in which case the freshest occurrence is what the
// user wants.
for (const { issue, findings } of withFindings) {
  const match = findings.find((f) => f.id === targetId);
  if (!match) continue;
  if (match.shipped) {
    stderr.write(`Finding ${targetId} already shipped in #${match.shippedPr ?? '?'}\n`);
    exit(3);
  }
  emit({
    issueNumber: issue.number,
    issueUrl: issue.url,
    createdAt: issue.createdAt,
    finding: match,
  });
  exit(0);
}

stderr.write(`Finding ${targetId} not found in any open review-bot issue\n`);
exit(1);

function emit(obj) {
  stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

/**
 * Parses one issue body into individual finding entries.
 *
 * A finding header is a top-level checklist line (no leading
 * whitespace) shaped like:
 *
 *   - [ ] **[SEVERITY]** `path` — title <!-- f:<sha7>.<idx> -->
 *   - [x] **[SEVERITY]** `path` — title (shipped in #N) <!-- f:<sha7>.<idx> -->
 *
 * The `review-fix-shipped` Action inserts ` (shipped in #N)` between
 * the title and the marker (NOT after the marker), so the shipped-PR
 * extraction must run against the matched `title` group and the
 * suffix must be stripped before storing.
 *
 * Quoted finding-marker text inside a `<details>` body is ignored —
 * only top-level checklist lines mark finding boundaries. The body
 * for each finding is every line between its header and the next
 * header (or end-of-issue), with leading/trailing blank lines
 * trimmed.
 */
function parseFindings(body) {
  const lines = body.split(/\r?\n/);
  const headerRe =
    /^- \[(?<box>[ x])\] \*\*\[(?<sev>BLOCKER|MAJOR|MINOR|NIT)\]\*\* `(?<path>[^`]+)` — (?<title>.*?) <!-- f:(?<id>[A-Za-z0-9]+\.[0-9]+) -->/;
  const shippedSuffixRe = /\s*\(shipped in #(\d+)\)\s*$/;

  const headers = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = headerRe.exec(lines[i]);
    if (m) headers.push({ index: i, ...m.groups });
  }

  return headers.map((h, idx) => {
    const nextIndex = headers[idx + 1]?.index ?? lines.length;
    const slice = lines.slice(h.index + 1, nextIndex);
    // The last header's slice runs through the issue's trailing
    // summary (counter-arguments, "Reviewed range", footer). Cut at
    // the first standalone `---` so a finding body never absorbs
    // metadata that belongs to the issue as a whole.
    const ruleAt = slice.findIndex((line) => /^---\s*$/.test(line));
    const bodyLines = ruleAt >= 0 ? slice.slice(0, ruleAt) : slice;
    while (bodyLines.length > 0 && bodyLines[0].trim() === '') {
      bodyLines.shift();
    }
    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
      bodyLines.pop();
    }

    const shippedMatch = shippedSuffixRe.exec(h.title);
    const cleanTitle = h.title.replace(shippedSuffixRe, '').trim();
    return {
      id: h.id,
      shipped: h.box === 'x',
      shippedPr: shippedMatch ? Number(shippedMatch[1]) : null,
      severity: h.sev,
      path: h.path,
      title: cleanTitle,
      body: bodyLines.join('\n'),
    };
  });
}
