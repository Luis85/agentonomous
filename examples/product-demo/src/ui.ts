import type { Agent, AgentState } from 'agentonomous';
import { NEEDS } from './demo-domain/scenarios/petCare/constants.js';

const INTERACTION_BUTTONS: { verb: string; label: string }[] = [
  { verb: 'feed', label: '🍖 Feed' },
  { verb: 'clean', label: '🫧 Clean' },
  { verb: 'play', label: '🎾 Play' },
  { verb: 'rest', label: '💤 Rest' },
  { verb: 'pet', label: '❤️ Pet' },
  { verb: 'medicate', label: '💊 Medicate' },
  { verb: 'scold', label: '😠 Scold' },
];

const STAGE_LABELS: Record<string, string> = {
  alive: 'Alive',
  egg: 'Egg',
  kitten: 'Kitten',
  adult: 'Cat',
  elder: 'Elder Cat',
  deceased: 'Deceased',
};

/** R-26: tracked lifetime counters for the death modal. */
type LifetimeCounters = {
  ateCount: number;
  scoldedCount: number;
  illnessCount: number;
  petCount: number;
};

export function mountHud(agent: Agent): {
  update: (state: AgentState) => void;
  dispose: () => void;
} {
  const bars = document.getElementById('bars') as HTMLElement;
  const modifiersEl = document.getElementById('modifier-list') as HTMLElement;
  const buttonsEl = document.getElementById('buttons') as HTMLElement;
  const trace = document.getElementById('trace') as HTMLElement;
  const petEl = document.getElementById('pet') as HTMLElement;
  const nameEl = document.getElementById('pet-name') as HTMLElement;
  const stageEl = document.getElementById('pet-stage') as HTMLElement;
  const moodEl = document.getElementById('pet-mood') as HTMLElement;
  const animEl = document.getElementById('pet-animation') as HTMLElement;

  // Build need bars and cache refs so the per-frame `update` loop never hits
  // `document.querySelector` — which was ~10 DOM traversals per RAF.
  const needRefs = new Map<string, { fill: HTMLElement; value: HTMLElement }>();
  for (const need of NEEDS) {
    const row = document.createElement('div');
    row.className = 'bar';
    row.innerHTML = `
      <span>${need.label}</span>
      <div class="bar-track"><div class="bar-fill" data-need="${need.id}" style="width: 100%"></div></div>
      <span class="bar-value" data-need-value="${need.id}">1.00</span>
    `;
    bars.appendChild(row);
    const fill = row.querySelector<HTMLElement>(`[data-need="${need.id}"]`);
    const value = row.querySelector<HTMLElement>(`[data-need-value="${need.id}"]`);
    if (fill && value) needRefs.set(need.id, { fill, value });
  }

  // Build interaction buttons
  for (const def of INTERACTION_BUTTONS) {
    const btn = document.createElement('button');
    btn.textContent = def.label;
    btn.addEventListener('click', () => {
      agent.interact(def.verb);
    });
    buttonsEl.appendChild(btn);
  }

  // Recent-event log (newest on top, trimmed tail) + R-26 lifetime counters.
  const traceLines: string[] = [];
  const counters: LifetimeCounters = {
    ateCount: 0,
    scoldedCount: 0,
    illnessCount: 0,
    petCount: 0,
  };
  const unsubscribe = agent.subscribe((event) => {
    const line = formatEventLine(event);
    if (line) {
      traceLines.unshift(line);
      if (traceLines.length > 40) traceLines.pop();
      trace.textContent = traceLines.join('\n');
    }

    // Tally the events we care about for the life-summary modal.
    if (event.type === 'SkillCompleted') {
      const skillId = (event as { skillId?: string }).skillId;
      if (skillId === 'feed') counters.ateCount += 1;
      else if (skillId === 'scold') counters.scoldedCount += 1;
      else if (skillId === 'pet') counters.petCount += 1;
    } else if (event.type === 'RandomEvent') {
      if ((event as { subtype?: string }).subtype === 'mildIllness') {
        counters.illnessCount += 1;
      }
    } else if (event.type === 'AgentDied') {
      const id = agent.identity.id;
      showLifeSummary(agent.identity.name ?? id, counters, event.at, () => {
        resetSimulation(id);
      });
    }
  });

  nameEl.textContent = agent.identity.name;

  const modifierTray = createModifierTrayRenderer(modifiersEl);

  return {
    update(state: AgentState): void {
      const stageLabel = STAGE_LABELS[state.stage] ?? state.stage;
      stageEl.textContent = `${stageLabel} — ${formatAge(state.ageSeconds)} old`;
      moodEl.textContent = `mood: ${state.mood?.category ?? '—'}`;
      animEl.textContent = `anim: ${state.animation}`;

      for (const need of NEEDS) {
        const level = state.needs[need.id] ?? 0;
        const refs = needRefs.get(need.id);
        if (refs) {
          refs.fill.style.width = `${Math.max(0, Math.min(100, level * 100))}%`;
          refs.fill.classList.toggle('critical', level < 0.25);
          refs.value.textContent = level.toFixed(2);
        }
      }

      modifierTray.update(agent, agent.getTimeScale() === 0);

      // Halt / animation visual cue.
      if (state.halted) {
        petEl.textContent = '💀';
        petEl.style.background = '#475569';
      } else if (state.modifiers.some((m) => m.id === 'dirty')) {
        petEl.textContent = '😾';
        petEl.style.background = '#a8a29e';
      } else if (state.animation === 'sleeping') {
        petEl.textContent = '😴';
        petEl.style.background = '#93c5fd';
      } else if (state.animation === 'eating') {
        petEl.textContent = '😋';
        petEl.style.background = '#fcd34d';
      } else if (state.animation === 'sick') {
        petEl.textContent = '🤒';
        petEl.style.background = '#d1d5db';
      } else if (state.mood?.category === 'sad') {
        petEl.textContent = '😢';
        petEl.style.background = '#bfdbfe';
      } else if (state.mood?.category === 'playful') {
        petEl.textContent = '😺';
        petEl.style.background = '#fde68a';
      } else {
        petEl.textContent = '🐱';
        petEl.style.background = '#fde68a';
      }
    },
    dispose(): void {
      unsubscribe();
    },
  };
}

/**
 * Discrete simulation-speed picker. The base scale is `baseScale` virtual
 * seconds per real second (10 in the product demo). Multipliers map
 * to `baseScale * mult`; the Pause button maps to scale 0.
 *
 * Persists the last selection to `localStorage` under `<storageKey>` so
 * reloads keep the player's preferred speed. Pause uses
 * `setTimeScale(0)` rather than `agent.kill(reason)` — `kill` is the
 * terminal death gate; `setTimeScale(0)` is the reversible pause.
 *
 * The picker is rendered as an ARIA `radiogroup`; the active button
 * carries `aria-pressed="true"` and a visual `.active` class. Saved
 * values that no longer match the available `choices` are discarded and
 * replaced with the default `1×`.
 */
export function mountSpeedPicker(
  agent: Agent,
  opts: { baseScale: number; storageKey: string },
): void {
  const container = document.getElementById('speed-picker');
  if (!container) return;
  container.setAttribute('role', 'radiogroup');
  container.setAttribute('aria-label', 'Simulation speed');
  const choices: { label: string; ariaLabel: string; mult: number | 'pause' }[] = [
    { label: '⏸ Pause', ariaLabel: 'Pause', mult: 'pause' },
    { label: '0.5×', ariaLabel: '0.5x speed', mult: 0.5 },
    { label: '1×', ariaLabel: '1x speed', mult: 1 },
    { label: '2×', ariaLabel: '2x speed', mult: 2 },
    { label: '4×', ariaLabel: '4x speed', mult: 4 },
    { label: '8×', ariaLabel: '8x speed', mult: 8 },
  ];
  const validMults = new Set<number | 'pause'>(choices.map((c) => c.mult));

  const saved = readSavedMult(opts.storageKey);
  const initialMult: number | 'pause' = saved !== null && validMults.has(saved) ? saved : 1;
  if (saved !== null && !validMults.has(saved)) writeSavedMult(opts.storageKey, 1);
  applyMult(agent, opts.baseScale, initialMult);

  const buttons: HTMLButtonElement[] = [];
  for (const [idx, choice] of choices.entries()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = choice.label;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-label', choice.ariaLabel);
    const isActive = choice.mult === initialMult;
    btn.setAttribute('aria-pressed', String(isActive));
    if (isActive) btn.classList.add('active');
    btn.addEventListener('click', () => {
      applyMult(agent, opts.baseScale, choice.mult);
      writeSavedMult(opts.storageKey, choice.mult);
      for (const [i, b] of buttons.entries()) {
        const active = i === idx;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      }
    });
    buttons.push(btn);
    container.appendChild(btn);
  }
}

function applyMult(agent: Agent, baseScale: number, mult: number | 'pause'): void {
  agent.setTimeScale(mult === 'pause' ? 0 : baseScale * mult);
}

const SNAPSHOT_PREFIX = 'agentonomous/';
const SNAPSHOT_INDEX_KEY = `${SNAPSHOT_PREFIX}__agentonomous/index__`;

/**
 * Wipe the persisted snapshot for `agentId` from `localStorage` and reload
 * the page so a fresh agent is constructed from defaults. The user's
 * speed-picker preference is intentionally preserved.
 *
 * Mirrors the `LocalStorageSnapshotStore` key layout
 * (`agentonomous/<id>` + the shared `agentonomous/__agentonomous/index__`)
 * and additionally clears the learning-mode trained-network key
 * (`agentonomous/<id>/tfjs-network`) so Reset stays a single
 * "fresh start" concept — the next learning-mode `construct()` falls
 * back to the default `learning.network.json` asset.
 */
export function resetSimulation(agentId: string): void {
  try {
    globalThis.localStorage?.removeItem(`${SNAPSHOT_PREFIX}${agentId}`);
    globalThis.localStorage?.removeItem(SNAPSHOT_INDEX_KEY);
    globalThis.localStorage?.removeItem(`${SNAPSHOT_PREFIX}${agentId}/tfjs-network`);
  } catch {
    // localStorage unavailable — nothing to clean up; reload still resets in-memory state.
  }
  globalThis.location?.reload();
}

/**
 * Mount Export / Import buttons that let the player save the current pet
 * to a JSON file and restore it later. Export serializes
 * `agent.snapshot()` to JSON and triggers a browser download; Import
 * reads a JSON file, parses it, and hands the payload to
 * `agent.restore(snapshot, { catchUp: false })`. `catchUp: false` keeps
 * the imported snapshot's virtual-time cursor stable — the player sees
 * the pet exactly as it was at save time, not fast-forwarded by the wall
 * clock that elapsed between export and import.
 *
 * Errors are surfaced via `alert()` — intentional Phase A ergonomics;
 * the demo never blocks on a Promise rejection during the import flow.
 */
export function mountExportImport(agent: Agent): void {
  const exportBtn = document.getElementById('export-button');
  const importBtn = document.getElementById('import-button');
  const fileInput = document.getElementById('import-file') as HTMLInputElement | null;
  if (!exportBtn || !importBtn || !fileInput) return;

  exportBtn.setAttribute('aria-label', `Export ${agent.identity.name ?? agent.identity.id}`);
  importBtn.setAttribute(
    'aria-label',
    `Import a saved ${agent.identity.name ?? agent.identity.id}`,
  );

  exportBtn.addEventListener('click', () => {
    let url: string | null = null;
    try {
      const snap = agent.snapshot();
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${agent.identity.id}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (err) {
      globalThis.alert?.(`Export failed: ${(err as Error).message}`);
    } finally {
      if (url !== null) URL.revokeObjectURL(url);
    }
  });

  importBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      fileInput.value = ''; // allow re-importing the same file name
      try {
        const parsed = JSON.parse(text) as Parameters<Agent['restore']>[0];
        // `snapshot()` omits the `modifiers` field when the list is empty,
        // and `restore()` only touches modifiers when the field is present.
        // That means importing a clean save over a sick/dirty pet would
        // leave stale modifiers active. Clear them explicitly before
        // restore so the imported state wins cleanly.
        for (const mod of agent.modifiers.list()) {
          agent.removeModifier(mod.id);
        }
        void agent.restore(parsed, { catchUp: false }).catch((err: Error) => {
          globalThis.alert?.(`Import failed: ${err.message}`);
        });
      } catch (err) {
        globalThis.alert?.(`Import failed: ${(err as Error).message}`);
      }
    };
    reader.onerror = () => {
      globalThis.alert?.('Import failed: could not read file.');
    };
    reader.readAsText(file);
  });
}

/**
 * Mount the persistent "Reset" button. Clicking it confirms the action,
 * then calls `resetSimulation(agentId)`. The confirm dialog guards against
 * accidental clicks since reset is destructive (lifetime stats lost).
 */
export function mountResetButton(agent: Agent): void {
  const btn = document.getElementById('reset-button');
  if (!btn) return;
  btn.setAttribute('aria-label', `Reset ${agent.identity.name ?? agent.identity.id}`);
  btn.addEventListener('click', () => {
    const name = agent.identity.name ?? agent.identity.id;
    if (globalThis.confirm?.(`Reset ${name}? Lifetime stats and current state will be lost.`)) {
      resetSimulation(agent.identity.id);
    }
  });
}

function readSavedMult(key: string): number | 'pause' | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === null || raw === undefined) return null;
    if (raw === 'pause') return 'pause';
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeSavedMult(key: string, mult: number | 'pause'): void {
  try {
    globalThis.localStorage?.setItem(key, mult === 'pause' ? 'pause' : String(mult));
  } catch {
    // localStorage unavailable (private mode, quota); silently skip.
  }
}

/**
 * Diffing renderer for the active-modifier chip list. Keeps `<li>` nodes
 * alive across frames so the per-frame HUD update only touches the
 * countdown text (the only thing that actually changes most ticks).
 *
 * Chips are keyed by `id` + occurrence index within the current
 * `agent.modifiers.list()` so `stack: 'stack'` entries (which share an
 * `id`) each get their own row. Reusing positional keys across frames
 * preserves diffing in the common case; when a middle entry expires the
 * remaining chips shift up, which rewrites their text but not the DOM
 * node count.
 *
 * When `paused` is true the countdown reads `paused` rather than a wall
 * clock figure. Modifier expiry is itself wall-clock-bound (see
 * `setTimeScale` JSDoc), so the countdown still elapses during pause;
 * this label keeps the UI honest about the user's intent without
 * misrepresenting the underlying state.
 */
type ModifierChip = { li: HTMLLIElement; time: HTMLSpanElement | null; label: string };

function createModifierTrayRenderer(host: HTMLElement): {
  update: (agent: Agent, paused: boolean) => void;
} {
  const chips = new Map<string, ModifierChip>();
  return {
    update(agent, paused) {
      const now = agent.clock.now();
      const list = agent.modifiers.list();
      const seen = new Set<string>();
      const nthById = new Map<string, number>();

      for (const mod of list) {
        const nth = nthById.get(mod.id) ?? 0;
        nthById.set(mod.id, nth + 1);
        const key = `${mod.id}#${nth}`;
        seen.add(key);

        const icon = mod.visual?.hudIcon;
        const name = mod.visual?.label ?? mod.id;
        const label = icon ? `${icon} ${name}` : name;
        const hasTime = typeof mod.expiresAt === 'number';

        let chip = chips.get(key);
        if (!chip) {
          const li = document.createElement('li');
          li.textContent = label;
          let time: HTMLSpanElement | null = null;
          if (hasTime) {
            time = document.createElement('span');
            time.className = 'mod-time';
            li.appendChild(time);
          }
          chip = { li, time, label };
          chips.set(key, chip);
          host.appendChild(li);
        } else {
          if (chip.label !== label) {
            // Positional slot now holds a different modifier (middle entry
            // expired and later ones shifted up) or the visual changed —
            // rewrite the label text while preserving the time span.
            chip.li.textContent = label;
            if (chip.time) chip.li.appendChild(chip.time);
            chip.label = label;
          }
          // Time span presence can flip if a chip slot is reused for a
          // modifier with/without `expiresAt`. Reconcile both directions.
          if (hasTime && !chip.time) {
            const time = document.createElement('span');
            time.className = 'mod-time';
            chip.li.appendChild(time);
            chip.time = time;
          } else if (!hasTime && chip.time) {
            chip.time.remove();
            chip.time = null;
          }
        }

        if (chip.time) {
          const nextText = paused
            ? ' paused'
            : ` ${formatRemaining(Math.max(0, (mod.expiresAt ?? now) - now))}`;
          if (chip.time.textContent !== nextText) chip.time.textContent = nextText;
        }
      }

      for (const [key, chip] of chips) {
        if (!seen.has(key)) {
          chip.li.remove();
          chips.delete(key);
        }
      }
    },
  };
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

/**
 * R-26: render a modal summarizing the pet's life when `AgentDied` fires.
 * Counters are aggregated from observed events during the session. The
 * "New pet" button calls `onNewPet` which typically wipes persisted state
 * and reloads the page.
 */
function showLifeSummary(
  name: string,
  counters: LifetimeCounters,
  diedAtMs: number,
  onNewPet: () => void,
): void {
  if (document.getElementById('life-summary')) return;
  const overlay = document.createElement('div');
  overlay.id = 'life-summary';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:rgba(15,23,42,0.7)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'z-index:9999',
    'font-family:system-ui,sans-serif',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'background:#fafafa',
    'color:#0f172a',
    'padding:24px 28px',
    'border-radius:12px',
    'max-width:360px',
    'box-shadow:0 20px 60px rgba(0,0,0,0.35)',
    'text-align:center',
  ].join(';');

  const died = new Date(diedAtMs).toISOString().slice(0, 19).replace('T', ' ');
  card.innerHTML = `
    <h2 style="margin:0 0 8px;font-size:22px;">🪦 ${escapeHtml(name)}</h2>
    <p style="margin:0 0 16px;color:#475569;font-size:14px;">Passed away at ${escapeHtml(died)}.</p>
    <ul style="list-style:none;padding:0;margin:0 0 16px;text-align:left;font-size:15px;">
      <li>🍖 Fed <strong>${counters.ateCount}</strong> times</li>
      <li>❤️ Petted <strong>${counters.petCount}</strong> times</li>
      <li>😠 Scolded <strong>${counters.scoldedCount}</strong> times</li>
      <li>🤒 Caught <strong>${counters.illnessCount}</strong> illnesses</li>
    </ul>
    <div style="display:flex;gap:8px;justify-content:center;">
      <button id="life-summary-close" style="padding:8px 16px;border-radius:6px;border:none;background:#cbd5e1;color:#0f172a;cursor:pointer;font-size:14px;">Close</button>
      <button id="life-summary-new" style="padding:8px 16px;border-radius:6px;border:none;background:#2563eb;color:white;cursor:pointer;font-size:14px;">🔄 New pet</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  document.getElementById('life-summary-close')?.addEventListener('click', () => {
    overlay.remove();
  });
  document.getElementById('life-summary-new')?.addEventListener('click', () => {
    onNewPet();
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const INTERACTION_VERB_LABELS: Record<string, string> = {
  feed: '🍖 Feed',
  clean: '🫧 Clean',
  play: '🎾 Play',
  rest: '💤 Rest',
  pet: '❤️ Pet',
  medicate: '💊 Medicate',
  scold: '😠 Scold',
};

const SKILL_LABELS: Record<string, string> = {
  feed: '🍖 Fed',
  clean: '🫧 Cleaned',
  play: '🎾 Played',
  rest: '💤 Rested',
  pet: '❤️ Petted',
  medicate: '💊 Medicated',
  scold: '😠 Scolded',
  'express-meow': '😺 Meowed',
  'express-sad': '😢 Cried',
  'express-sleepy': '😴 Yawned',
};

const RANDOM_EVENT_LABELS: Record<string, string> = {
  mildIllness: '🤒 Fell ill',
  surpriseTreat: '🎁 Surprise treat',
  messyPlay: '🧹 Made a mess',
};

const NEED_LABELS: Record<string, string> = {
  hunger: 'hunger',
  cleanliness: 'cleanliness',
  happiness: 'happiness',
  energy: 'energy',
  health: 'health',
};

function formatTimestamp(at: number): string {
  return new Date(at).toISOString().slice(11, 19);
}

function needLabel(id: string): string {
  return NEED_LABELS[id] ?? id;
}

/**
 * Turn a domain event into a single-line, human-friendly log entry. Returns
 * `null` for events we intentionally skip (e.g. the synthetic `__init__`
 * emitted by `bindAgentToStore`) so the log stays focused on simulation
 * activity.
 */
function formatEventLine(
  event: { type: string; at: number } & Record<string, unknown>,
): string | null {
  const ts = formatTimestamp(event.at);
  const t = event.type;

  if (t === '__init__') return null;

  if (t === 'InteractionRequested') {
    const verb = typeof event['verb'] === 'string' ? (event['verb'] as string) : 'unknown';
    const label = INTERACTION_VERB_LABELS[verb] ?? verb;
    return `${ts}  → ${label} requested`;
  }
  if (t === 'SkillCompleted') {
    const skillId = typeof event['skillId'] === 'string' ? (event['skillId'] as string) : 'skill';
    const eff = typeof event['effectiveness'] === 'number' ? (event['effectiveness'] as number) : 1;
    const label = SKILL_LABELS[skillId] ?? skillId;
    const pct = Math.round(eff * 100);
    return `${ts}  ✓ ${label}${pct === 100 ? '' : ` (${pct}% effective)`}`;
  }
  if (t === 'SkillFailed') {
    const skillId = typeof event['skillId'] === 'string' ? (event['skillId'] as string) : 'skill';
    const code = typeof event['code'] === 'string' ? (event['code'] as string) : 'failed';
    const msg = typeof event['message'] === 'string' ? (event['message'] as string) : '';
    const label = SKILL_LABELS[skillId] ?? skillId;
    return `${ts}  ✗ ${label} failed — ${code}${msg ? `: ${msg}` : ''}`;
  }
  if (t === 'RandomEvent') {
    const subtype = typeof event['subtype'] === 'string' ? (event['subtype'] as string) : '';
    const label = RANDOM_EVENT_LABELS[subtype] ?? `random: ${subtype || 'unknown'}`;
    return `${ts}  ⚡ ${label}`;
  }
  if (t === 'NeedCritical') {
    const needId = typeof event['needId'] === 'string' ? (event['needId'] as string) : '?';
    const level = typeof event['level'] === 'number' ? (event['level'] as number) : NaN;
    return `${ts}  ⚠ ${needLabel(needId)} critical (${level.toFixed(2)})`;
  }
  if (t === 'NeedSafe') {
    const needId = typeof event['needId'] === 'string' ? (event['needId'] as string) : '?';
    const level = typeof event['level'] === 'number' ? (event['level'] as number) : NaN;
    return `${ts}  ✓ ${needLabel(needId)} recovered (${level.toFixed(2)})`;
  }
  if (t === 'NeedSatisfied') {
    const needId = typeof event['needId'] === 'string' ? (event['needId'] as string) : '?';
    const before = typeof event['before'] === 'number' ? (event['before'] as number) : NaN;
    const after = typeof event['after'] === 'number' ? (event['after'] as number) : NaN;
    return `${ts}  + ${needLabel(needId)} ${before.toFixed(2)} → ${after.toFixed(2)}`;
  }
  if (t === 'ModifierApplied') {
    const mod = event['modifier'] as
      | { id?: string; visual?: { label?: string }; source?: string }
      | undefined;
    const id = mod?.visual?.label ?? mod?.id ?? 'modifier';
    const source = mod?.source ? ` (${mod.source})` : '';
    return `${ts}  + ${id}${source}`;
  }
  if (t === 'ModifierExpired') {
    const id =
      typeof event['modifierId'] === 'string' ? (event['modifierId'] as string) : 'modifier';
    return `${ts}  − ${id} expired`;
  }
  if (t === 'ModifierRemoved') {
    const id =
      typeof event['modifierId'] === 'string' ? (event['modifierId'] as string) : 'modifier';
    const reason = typeof event['reason'] === 'string' ? (event['reason'] as string) : 'removed';
    return `${ts}  − ${id} ${reason}`;
  }
  if (t === 'MoodChanged') {
    const from = typeof event['from'] === 'string' ? (event['from'] as string) : '—';
    const to = typeof event['to'] === 'string' ? (event['to'] as string) : '?';
    return `${ts}  mood ${from} → ${to}`;
  }
  if (t === 'LifeStageChanged') {
    const from = typeof event['from'] === 'string' ? (event['from'] as string) : '?';
    const to = typeof event['to'] === 'string' ? (event['to'] as string) : '?';
    return `${ts}  🎂 ${from} → ${to}`;
  }
  if (t === 'AgentDied') {
    const cause = typeof event['cause'] === 'string' ? (event['cause'] as string) : 'unknown';
    const reason = typeof event['reason'] === 'string' ? ` — ${event['reason'] as string}` : '';
    return `${ts}  🪦 died: ${cause}${reason}`;
  }

  return `${ts}  ${t}`;
}
