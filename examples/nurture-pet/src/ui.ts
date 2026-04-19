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
      stageEl.textContent = `stage: ${state.stage}`;
      ageEl.textContent = `age: ${state.ageSeconds.toFixed(1)}s`;
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

      modifiersEl.innerHTML = '';
      for (const mod of state.modifiers) {
        const li = document.createElement('li');
        li.textContent = mod.id;
        modifiersEl.appendChild(li);
      }

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
