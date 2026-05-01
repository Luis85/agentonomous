#!/usr/bin/env node
/**
 * Create v1 backlog issues in GitHub from the 2026-05-01 backlog plan.
 *
 * Usage:
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/create-v1-issues.mjs
 *
 * Optional:
 *   ISSUE_MILESTONE=v1.0
 *   ISSUE_LABELS=v1,demo-v2,quality
 */

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;

if (!token) {
  console.error('Missing GITHUB_TOKEN.');
  process.exit(1);
}
if (!repository?.includes('/')) {
  console.error('Missing/invalid GITHUB_REPOSITORY (expected owner/repo).');
  process.exit(1);
}

const [owner, repo] = repository.split('/');
const milestoneTitle = process.env.ISSUE_MILESTONE ?? 'v1.0';
const labelOverride = process.env.ISSUE_LABELS
  ? process.env.ISSUE_LABELS.split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  : null;

const issues = [
  [
    'Pillar 2 scaffolding: rolling diff metrics + store wiring',
    'demo-v2,cognition,v1',
    'Tracks: #132\n\nScope: slices 2.1 + 2.2\n\n- Add demo-domain diff metric modules\n- Wire AGENT_TICKED capture in useAgentSession and useDiffPanelView\n- Add unit coverage for metric/store integration\n\nDone when: P2-FR-1/2/4/5 checks are green.',
  ],
  [
    'Pillar 2 UI: diff card + what-changed summary',
    'demo-v2,cognition,v1',
    'Tracks: #132\n\nScope: slice 2.3\n\n- Add DiffCard, MetricRow, WhatChangedSummary, DiffView\n- Render visible delta within 1–3 ticks after mode switch\n- Add UI tests for empty-peer and steady-state behavior',
  ],
  [
    'Pillar 2 hardening: confidence labels + threshold tuning',
    'demo-v2,cognition,v1',
    'Tracks: #132\n\nScope: slice 2.4\n\n- Implement confidence model and threshold constants\n- Capture soak-tuned defaults and notes in plan done-log',
  ],
  [
    'Pillar 2 migration: port cognition switcher/SVG renderers to Vue SFCs',
    'demo-v2,cognition,v1',
    'Tracks: #132\n\nScope: slice 2.5\n\n- Port cognitionSwitcher.ts to CognitionSwitcher + setMode store API\n- Port lossSparkline/predictionStrip to SFCs\n- Delete legacy files after parity tests pass',
  ],
  [
    'Pillar 3 core: deterministic fingerprint domain + recorder store',
    'demo-v2,determinism,v1',
    'Tracks: #132\n\nScope: slices 3.1 + 3.2\n\n- Add normalizer/hash/scope-key helpers\n- Add useFingerprintRecorder deterministic persistence model\n- Add unit coverage + stable hash regression snapshots',
  ],
  [
    'Pillar 3 UI/E2E: badge, replay report, seed panel, known-good script',
    'demo-v2,determinism,v1',
    'Tracks: #132\n\nScope: slices 3.3 + 3.4\n\n- Add FingerprintBadge/ReplayReport/CopyReportButton/SeedPanel/ReplayView\n- Add replay-determinism.spec.ts for matched/diverged/insufficient sample',
  ],
  [
    'Pillar 4 engine: cross-scenario config schema + validation/diff',
    'demo-v2,config,v1',
    'Tracks: #132\n\nScope: slice 4.1\n\n- Add config engine types/schema/validator/diff\n- Relocate pet-care config logic to scenario config modules\n- Add preview-vs-commit whitelist tests',
  ],
  [
    'Pillar 4 domain flow: useConfigDraft preview lifecycle + commit handshake',
    'demo-v2,config,v1',
    'Tracks: #132\n\nScope: slices 4.2 + 4.4 (domain)\n\n- Add preview apply/revert lifecycle in store\n- Wire commit restart + fingerprint reset handshake\n- Apply legacy key cleanup in app/main.ts',
  ],
  [
    'Pillar 4 UI migration: JSON editor view + remove legacy mount module',
    'demo-v2,config,v1',
    'Tracks: #132\n\nScope: slice 4.3\n\n- Add JsonEditor view/component stack\n- Remove legacy speciesConfig.ts after coverage parity',
  ],
  [
    'Pillar 5 expansion: Scenario contract + catalog + selector routing',
    'demo-v2,scenario,v1',
    'Tracks: #132\n\nScope: slices 5.1 + 5.2\n\n- Add Scenario contract + useScenarioCatalog\n- Wrap pet-care as Scenario\n- Add scenario selector UI + /play/:scenarioId route',
  ],
  [
    'Pillar 5 content: companion-npc reference scenario',
    'demo-v2,scenario,v1',
    'Tracks: #132\n\nScope: slice 5.3\n\n- Implement companion-npc scenario (skills/config)\n- Add contract tests + determinism checks',
  ],
  [
    'Pillar 5 polish: per-scenario seed/config scoping + scenario-swap E2E',
    'demo-v2,scenario,v1',
    'Tracks: #132\n\nScope: slice 5.4\n\n- Scope storage keys by scenario\n- Add scenario-swap Playwright coverage',
  ],
  [
    'Quality row 6: determinism replay baseline workflow',
    'quality,determinism,ci,v1',
    'Implement row 6 from docs/plans/2026-04-26-quality-automation-routines.md\n\n- Add tests/determinism/replay.ts + baseline artifact\n- Wire dual-mode scripts + CI workflow',
  ],
  [
    'Quality row 7: mutation testing weekly run',
    'quality,ci,v1',
    'Implement row 7 from docs/plans/2026-04-26-quality-automation-routines.md\n\n- Add Stryker config/scripts/artifact upload\n- Keep report-open instruction cross-platform',
  ],
  [
    'Quality row 8: nightly demo smoke workflow',
    'quality,ci,v1',
    'Implement row 8 from docs/plans/2026-04-26-quality-automation-routines.md\n\n- Add/align nightly Playwright smoke\n- Add PR-path trigger + stability assertions',
  ],
  [
    'Resolve unchecked MINOR daily-review findings (batch)',
    'quality,v1',
    'Convert unchecked MINOR findings from 2026-04-26/27/28/30 daily reviews into code fixes with tests where applicable.\n\nChecklist:\n- stage-blocked failure branch test coverage\n- detectBestBackend concurrency safety\n- PlayView seed key dedupe\n- cognitionSwitcher reasoner/learner wiring race\n- useAgentSession stale-epoch dispose + learning-mode wiring\n- useAgentSession test microtask flush brittleness',
  ],
];

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} :: ${text}`);
  }
  return res.json();
}

async function resolveMilestone() {
  let page = 1;
  while (true) {
    const batch = await gh(
      `/repos/${owner}/${repo}/milestones?state=open&per_page=100&page=${page}`,
    );
    const found = batch.find((m) => m.title === milestoneTitle);
    if (found) return found.number;
    if (batch.length < 100) return undefined;
    page++;
  }
}

(async () => {
  const milestone = await resolveMilestone();
  for (const [title, labelsCsv, body] of issues) {
    const labels =
      labelOverride ??
      labelsCsv
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    const payload = { title, body, labels };
    if (milestone !== undefined) payload.milestone = milestone;
    const created = await gh(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    console.log(`#${created.number} ${created.title} -> ${created.html_url}`);
  }
})().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
