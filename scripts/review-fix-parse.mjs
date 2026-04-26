#!/usr/bin/env node
/**
 * review-fix tracker comment parser.
 *
 * Reads the raw `gh api ... --paginate --slurp` output for issue #87
 * comments and emits a structured JSON description of the most recent
 * comment that contains finding markers. Used by the `review-fix`
 * skill to sidestep platform-specific shell pitfalls:
 *   - Windows Git Bash maps `/tmp` to `D:\tmp` for native binaries,
 *     breaking Node `fs.readFileSync('/tmp/...')`.
 *   - `gh --paginate --slurp` rejects `--jq` / `--template` flags.
 *   - `jq` is not installed by default on Windows or many CI images.
 *
 * Node is a hard project requirement (TypeScript library, ESM, Node 22
 * per `.nvmrc`), so this script is the canonical parser the skill
 * shells out to.
 *
 * Usage:
 *   gh api "repos/<owner>/<repo>/issues/87/comments" --paginate --slurp \
 *     > .review-fix-cache/comments.json
 *   node scripts/review-fix-parse.mjs .review-fix-cache/comments.json \
 *     > .review-fix-cache/parsed.json
 *
 * Output schema (single JSON object):
 *   {
 *     "commentId": <number>,
 *     "commentUrl": <string>,
 *     "createdAt": <iso8601>,
 *     "findings": [
 *       {
 *         "id":        "<sha7>.<idx>",
 *         "shipped":   <bool>,
 *         "shippedPr": <number|null>,
 *         "severity":  "BLOCKER" | "MAJOR" | "MINOR" | "NIT",
 *         "path":      "<repo-relative path[:line]>",
 *         "title":     "<one-line>",
 *         "body":      "<raw verbatim body chunk, may include diff blocks>"
 *       }
 *     ]
 *   }
 *
 * Exits 1 with a stderr message if no comment in the input contains
 * finding markers (the bot may post no-op summary comments — those
 * are skipped).
 */

import { readFileSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';

const inputPath = argv[2];
if (!inputPath) {
  stderr.write('usage: review-fix-parse.mjs <comments.json>\n');
  exit(2);
}

const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
// `gh --paginate --slurp` returns an array of pages (one entry per
// page), not a flat list of comments. Flatten one level so callers
// can stay agnostic.
const comments = (Array.isArray(raw) ? raw : [raw]).flat();

const withFindings = comments
  .filter((c) => typeof c.body === 'string' && c.body.includes('<!-- f:'))
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

const last = withFindings[withFindings.length - 1];
if (!last) {
  stderr.write('No comment on the tracker contains findings — nothing to sweep\n');
  exit(1);
}

const findings = parseFindings(last.body);
const payload = JSON.stringify(
  {
    commentId: last.id,
    commentUrl: last.html_url,
    createdAt: last.created_at,
    findings,
  },
  null,
  2,
);
stdout.write(`${payload}\n`);

/**
 * Parses one comment body into individual finding entries.
 *
 * A finding header is a top-level checklist line (no leading
 * whitespace) shaped like:
 *
 *   - [ ] **[SEVERITY]** `path` — title <!-- f:<sha7>.<idx> --> [(shipped in #N)]
 *
 * Quoted finding-marker text inside a `<details>` body is ignored —
 * only top-level checklist lines mark finding boundaries. The body
 * for each finding is every line between its header and the next
 * header (or end-of-comment), with leading/trailing blank lines
 * trimmed.
 */
function parseFindings(body) {
  const lines = body.split(/\r?\n/);
  const headerRe =
    /^- \[(?<box>[ x])\] \*\*\[(?<sev>BLOCKER|MAJOR|MINOR|NIT)\]\*\* `(?<path>[^`]+)` — (?<title>.*?) <!-- f:(?<id>[A-Za-z0-9]+\.[0-9]+) -->(?<trail>.*)$/;

  const headers = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = headerRe.exec(lines[i]);
    if (m) headers.push({ index: i, ...m.groups });
  }

  return headers.map((h, idx) => {
    const nextIndex = headers[idx + 1]?.index ?? lines.length;
    const slice = lines.slice(h.index + 1, nextIndex);
    // The last header's slice runs through the comment's trailing
    // summary (counter-arguments, "Reviewed range", footer). Cut at
    // the first standalone `---` so a finding body never absorbs
    // metadata that belongs to the comment as a whole.
    const ruleAt = slice.findIndex((line) => /^---\s*$/.test(line));
    const bodyLines = ruleAt >= 0 ? slice.slice(0, ruleAt) : slice;
    while (bodyLines.length > 0 && bodyLines[0].trim() === '') {
      bodyLines.shift();
    }
    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
      bodyLines.pop();
    }

    const shippedMatch = /\(shipped in #(\d+)\)/.exec(h.trail ?? '');
    return {
      id: h.id,
      shipped: h.box === 'x',
      shippedPr: shippedMatch ? Number(shippedMatch[1]) : null,
      severity: h.sev,
      path: h.path,
      title: h.title.trim(),
      body: bodyLines.join('\n'),
    };
  });
}
