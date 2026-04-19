import type { Agent, AgentState } from 'agentonomous';

const NEEDS: { id: string; label: string }[] = [
  { id: 'hunger', label: 'Hunger' },
  { id: 'cleanliness', label: 'Cleanliness' },
  { id: 'happiness', label: 'Happiness' },
  { id: 'energy', label: 'Energy' },
  { id: 'health', label: 'Health' },
];

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
  egg: 'Egg',
  kitten: 'Kitten',
  adult: 'Cat',
  elder: 'Elder Cat',
  deceased: 'Deceased',
};

/** R-26: tracked lifetime counters for the death modal. */
interface LifetimeCounters {
  ateCount: number;
  scoldedCount: number;
  illnessCount: number;
  petCount: number;
}

export function mountHud(agent: Agent): { update: (state: AgentState) => void } {
  const bars = document.getElementById('bars') as HTMLElement;
  const modifiersEl = document.getElementById('modifier-list') as HTMLElement;
  const buttonsEl = document.getElementById('buttons') as HTMLElement;
  const trace = document.getElementById('trace') as HTMLElement;
  const petEl = document.getElementById('pet') as HTMLElement;
  const nameEl = document.getElementById('pet-name') as HTMLElement;
  const stageEl = document.getElementById('pet-stage') as HTMLElement;
  const ageEl = document.getElementById('pet-age') as HTMLElement;
  const moodEl = document.getElementById('pet-mood') as HTMLElement;
  const animEl = document.getElementById('pet-animation') as HTMLElement;

  // Build need bars
  for (const need of NEEDS) {
    const row = document.createElement('div');
    row.className = 'bar';
    row.innerHTML = `
      <span>${need.label}</span>
      <div class="bar-track"><div class="bar-fill" data-need="${need.id}" style="width: 100%"></div></div>
      <span class="bar-value" data-need-value="${need.id}">1.00</span>
    `;
    bars.appendChild(row);
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

  // Recent-event log (trimmed tail) + R-26 lifetime counters.
  const traceLines: string[] = [];
  const counters: LifetimeCounters = {
    ateCount: 0,
    scoldedCount: 0,
    illnessCount: 0,
    petCount: 0,
  };
  agent.subscribe((event) => {
    traceLines.push(
      `${new Date(event.at).toISOString().slice(11, 19)}  ${event.type}${
        typeof event.agentId === 'string' ? ` (${event.agentId})` : ''
      }`,
    );
    if (traceLines.length > 40) traceLines.shift();
    trace.textContent = traceLines.join('\n');

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
      showLifeSummary(agent.identity.name ?? agent.identity.id, counters, event.at);
    }
  });

  nameEl.textContent = agent.identity.name;

  return {
    update(state: AgentState): void {
      const stageLabel = STAGE_LABELS[state.stage] ?? state.stage;
      stageEl.textContent = `${stageLabel} — ${formatAge(state.ageSeconds)} old`;
      ageEl.textContent = '';
      moodEl.textContent = `mood: ${state.mood?.category ?? '—'}`;
      animEl.textContent = `anim: ${state.animation}`;

      for (const need of NEEDS) {
        const level = state.needs[need.id] ?? 0;
        const fill = document.querySelector<HTMLElement>(`[data-need="${need.id}"]`);
        const value = document.querySelector<HTMLElement>(`[data-need-value="${need.id}"]`);
        if (fill) {
          fill.style.width = `${Math.max(0, Math.min(100, level * 100))}%`;
          fill.classList.toggle('critical', level < 0.25);
        }
        if (value) value.textContent = level.toFixed(2);
      }

      renderModifierTray(modifiersEl, agent);

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
  };
}

/**
 * Discrete simulation-speed picker. The base scale is `baseScale` virtual
 * seconds per real second (60 in the nurture-pet demo). Multipliers map
 * to `baseScale * mult`; the Pause button maps to scale 0.
 *
 * Persists the last selection to `localStorage` under `<storageKey>` so
 * reloads keep the player's preferred speed. Pause is intentionally NOT
 * `agent.halt()` — `halt()` is the death gate, terminal and one-way.
 * `setTimeScale(0)` is the reversible pause.
 */
export function mountSpeedPicker(
  agent: Agent,
  opts: { baseScale: number; storageKey: string },
): void {
  const container = document.getElementById('speed-picker');
  if (!container) return;
  const choices: { label: string; mult: number | 'pause' }[] = [
    { label: '⏸︎ Pause', mult: 'pause' },
    { label: '0.5×', mult: 0.5 },
    { label: '1×', mult: 1 },
    { label: '2×', mult: 2 },
    { label: '4×', mult: 4 },
    { label: '8×', mult: 8 },
  ];

  const saved = readSavedMult(opts.storageKey);
  const initialMult: number | 'pause' = saved ?? 1;
  applyMult(agent, opts.baseScale, initialMult);

  const buttons: HTMLButtonElement[] = [];
  choices.forEach((choice, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = choice.label;
    btn.addEventListener('click', () => {
      applyMult(agent, opts.baseScale, choice.mult);
      writeSavedMult(opts.storageKey, choice.mult);
      buttons.forEach((b, i) => b.classList.toggle('active', i === idx));
    });
    if (choice.mult === initialMult) btn.classList.add('active');
    buttons.push(btn);
    container.appendChild(btn);
  });
}

function applyMult(agent: Agent, baseScale: number, mult: number | 'pause'): void {
  agent.setTimeScale(mult === 'pause' ? 0 : baseScale * mult);
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
 * Render active modifiers as a chip list with the modifier's HUD icon (if
 * declared on `Modifier.visual.hudIcon`) and a live remaining-time
 * countdown for time-bound modifiers.
 */
function renderModifierTray(host: HTMLElement, agent: Agent): void {
  host.innerHTML = '';
  const now = agent.clock.now();
  for (const mod of agent.modifiers.list()) {
    const li = document.createElement('li');
    const icon = mod.visual?.hudIcon;
    const label = icon ? `${icon} ${mod.id}` : mod.id;
    li.textContent = label;
    if (typeof mod.expiresAt === 'number') {
      const remainingMs = Math.max(0, mod.expiresAt - now);
      const time = document.createElement('span');
      time.className = 'mod-time';
      time.textContent = ` ${formatRemaining(remainingMs)}`;
      li.appendChild(time);
    }
    host.appendChild(li);
  }
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
  return rem === 0 ? `${m}m` : `${m}m${rem}s`;
}

/**
 * R-26: render a modal summarizing the pet's life when `AgentDied` fires.
 * Counters are aggregated from observed events during the session.
 */
function showLifeSummary(name: string, counters: LifetimeCounters, diedAtMs: number): void {
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
    <button id="life-summary-close" style="padding:8px 16px;border-radius:6px;border:none;background:#2563eb;color:white;cursor:pointer;font-size:14px;">Close</button>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  document.getElementById('life-summary-close')?.addEventListener('click', () => {
    overlay.remove();
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
